/**
 * Example of how to use the pruned runtime config in a web application
 */

import { config, getDependencyUrl, getSecretRef, getStaticEnvVar } from './tsops.runtime.clean'

// Example Express.js application
import express from 'express'

const app = express()

// Get service URLs from runtime config
const apiUrl = getDependencyUrl('api') // 'http://hyper-graph-api.prod.svc.cluster.local:8080'
const authUrl = getDependencyUrl('auth') // 'http://hyper-graph-auth.prod.svc.cluster.local:8081'
const observabilityUrl = getDependencyUrl('observability') // 'http://hyper-graph-observability.prod.svc.cluster.local:4318'

// Get static environment variables
const port = getStaticEnvVar('PORT') || '8080'
const nodeEnv = getStaticEnvVar('NODE_ENV') || 'development'
const domain = getStaticEnvVar('DOMAIN') || 'localhost'

// Get secret references (for Kubernetes deployment)
const jwtSecretRef = getSecretRef('JWT_SECRET') // { secretName: 'web-secrets', secretKey: 'JWT_SECRET' }
const apiKeyRef = getSecretRef('API_KEY') // { secretName: 'web-secrets', secretKey: 'API_KEY' }

console.log('Service configuration:')
console.log(`- API URL: ${apiUrl}`)
console.log(`- Auth URL: ${authUrl}`)
console.log(`- Observability URL: ${observabilityUrl}`)
console.log(`- Port: ${port}`)
console.log(`- Environment: ${nodeEnv}`)
console.log(`- Domain: ${domain}`)

// Example API client setup
const apiClient = {
  baseURL: apiUrl,
  timeout: 5000,
  headers: {
    'User-Agent': 'web-service',
    'Content-Type': 'application/json'
  }
}

const authClient = {
  baseURL: authUrl,
  timeout: 5000,
  headers: {
    'User-Agent': 'web-service',
    'Content-Type': 'application/json'
  }
}

// Example route that uses the dependencies
app.get('/api/data', async (req, res) => {
  try {
    // Call API service
    const response = await fetch(`${apiUrl}/data`, {
      headers: {
        'Authorization': `Bearer ${req.headers.authorization}`
      }
    })
    
    const data = await response.json()
    res.json(data)
  } catch (error) {
    console.error('Failed to fetch data from API:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.get('/auth/verify', async (req, res) => {
  try {
    // Call Auth service
    const response = await fetch(`${authUrl}/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${req.headers.authorization}`
      }
    })
    
    const result = await response.json()
    res.json(result)
  } catch (error) {
    console.error('Failed to verify with Auth service:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: config.service.name,
    version: config.service.image.split(':')[1],
    dependencies: config.dependencies.map(dep => ({
      service: dep.service,
      status: 'connected' // In real app, you'd ping each service
    }))
  })
})

app.listen(port, () => {
  console.log(`Web service listening on port ${port}`)
  console.log(`Environment: ${nodeEnv}`)
  console.log(`Domain: ${domain}`)
})

// Example Kubernetes deployment would use the secret references:
/*
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  template:
    spec:
      containers:
      - name: web
        image: ghcr.io/org/hyper-graph-web:abc123
        env:
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: web-secrets
              key: JWT_SECRET
        - name: API_KEY
          valueFrom:
            secretKeyRef:
              name: web-secrets
              key: API_KEY
        - name: LOG_LEVEL
          valueFrom:
            configMapKeyRef:
              name: web-config
              key: LOG_LEVEL
*/