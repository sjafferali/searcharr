import { Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components'
import {
  BookmarksPage,
  ClientsPage,
  FeedsPage,
  HistoryPage,
  InstancesPage,
  SearchPage,
} from './pages'

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<SearchPage />} />
        <Route path="/feeds" element={<FeedsPage />} />
        <Route path="/bookmarks" element={<BookmarksPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/instances" element={<InstancesPage />} />
        <Route path="/clients" element={<ClientsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}

export default App
