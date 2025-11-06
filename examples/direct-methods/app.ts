import config from './tsops.config.ts'

// ============================================================================
// Runtime Config Usage Example
// ============================================================================

// ✅ Service-to-service communication (internal)
const apiServiceUrl = config.url('api', 'service')  // http://api
const apiClusterUrl = config.url('api', 'cluster')  // http://api.prod.svc.cluster.local

console.log('Internal API URL (service):', apiServiceUrl)
console.log('Internal API URL (cluster):', apiClusterUrl)

// ✅ Public ingress URL (external traffic)
const publicApiUrl = config.url('api', 'ingress')  // https://api.example.com
console.log('Public API URL:', publicApiUrl)

// ✅ Get DNS names
const apiDns = config.dns('api', 'service')  // api
console.log('API DNS:', apiDns)

// ✅ Get environment variables
const jwtSecret = config.env('api', 'JWT_SECRET')
console.log('JWT Secret:', jwtSecret ? '***' : 'not set')

// ============================================================================
// Real-world usage in your application
// ============================================================================

// Example: Making requests to other services
async function fetchUserData(userId: string) {
  // ✅ Use config.url() for internal service communication
  const apiUrl = config.url('api', 'service')
  const response = await fetch(`${apiUrl}/users/${userId}`)
  return response.json()
}

// Example: Getting public URL for frontend
function getPublicApiEndpoint() {
  // ✅ Use config.url() with 'ingress' for public URLs
  return config.url('api', 'ingress')
}