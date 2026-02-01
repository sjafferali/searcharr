import { Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components'
import { SearchPage, InstancesPage, ClientsPage } from './pages'

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<SearchPage />} />
        <Route path="/instances" element={<InstancesPage />} />
        <Route path="/clients" element={<ClientsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}

export default App
