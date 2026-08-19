import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { LoginGate } from '@/components/auth/LoginGate'
import { BottomNav } from '@/components/nav/BottomNav'
import Home from '@/routes/Home'
import SpendingBreakdown from '@/routes/SpendingBreakdown'
import Insights from '@/routes/Insights'
import Settings from '@/routes/Settings'

// AICoachProvider/AIBar/ConfirmationCard join this shell in the AI backend
// orchestration phase, once api/ai.ts exists — same order the health app
// was built in (routes and CRUD first, then the AI layer on top).
function AppShell() {
  return (
    <>
      <div className="app-frame pb-20 sm:shadow-raised">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/spending" element={<SpendingBreakdown />} />
          <Route path="/insights" element={<Insights />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-40 sm:mx-auto sm:max-w-xl sm:shadow-raised">
        <BottomNav />
      </div>
    </>
  )
}

function App() {
  return (
    <LoginGate>
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
    </LoginGate>
  )
}

export default App
