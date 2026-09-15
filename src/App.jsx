import { Navigate, Route, Routes } from 'react-router-dom'
import { useStore } from './lib/store.jsx'
import Layout from './components/Layout.jsx'
import Splash from './components/Splash.jsx'
import Login from './pages/Login.jsx'
import FamilyGate from './pages/FamilyGate.jsx'
import SetupNeeded from './pages/SetupNeeded.jsx'
import Tree from './pages/Tree.jsx'
import People from './pages/People.jsx'
import PersonForm from './pages/PersonForm.jsx'
import PersonDetail from './pages/PersonDetail.jsx'
import Settings from './pages/Settings.jsx'

export default function App() {
  const { configured, authLoading, authUser, memberships, membershipsError, retryMemberships, familyId, ready, fatal, retry, logout, canEdit } = useStore()

  if (!configured) return <SetupNeeded />
  if (authLoading) return <Splash />

  if (!authUser) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    )
  }

  if (membershipsError) return <Splash error={membershipsError} onRetry={retryMemberships} onLogout={logout} />
  if (memberships === null) return <Splash />

  // 尚未加入任何家族,或正在處理邀請連結
  if (!familyId) {
    return (
      <Routes>
        <Route path="/join/:code" element={<FamilyGate mode="join" />} />
        <Route path="/view/:code" element={<FamilyGate mode="view" />} />
        <Route path="*" element={<FamilyGate />} />
      </Routes>
    )
  }

  if (fatal) return <Splash error={fatal} onRetry={retry} onLogout={logout} />
  if (!ready) return <Splash />

  return (
    <Routes>
      <Route path="/join/:code" element={<FamilyGate mode="join" />} />
      <Route path="/view/:code" element={<FamilyGate mode="view" />} />
      <Route path="/family" element={<FamilyGate />} />
      <Route element={<Layout />}>
        <Route index element={<Tree />} />
        <Route path="people" element={<People />} />
        <Route path="people/new" element={canEdit ? <PersonForm /> : <Navigate to="/people" replace />} />
        <Route path="people/:id" element={<PersonDetail />} />
        <Route path="people/:id/edit" element={canEdit ? <PersonForm /> : <Navigate to="/people" replace />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
