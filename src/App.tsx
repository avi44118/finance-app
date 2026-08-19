import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { LoginGate } from '@/components/auth/LoginGate'
import { BottomNav } from '@/components/nav/BottomNav'
import { AICoachProvider } from '@/components/ai/AICoachProvider'
import { AIBar } from '@/components/ai/AIBar'
import { ConfirmationCard } from '@/components/ai/ConfirmationCard'
import { useAICoach } from '@/hooks/useAICoach'
import Home from '@/routes/Home'
import SpendingBreakdown from '@/routes/SpendingBreakdown'
import Insights from '@/routes/Insights'
import Settings from '@/routes/Settings'

const PAGE_BY_PATH: Record<string, string> = {
  '/': 'home',
  '/spending': 'spending_breakdown',
  '/insights': 'insights',
  '/settings': 'settings',
}

/** Keeps AICoachContext's currentPage in sync with the route, so the AI always knows what she's looking at. */
function usePageSync() {
  const location = useLocation()
  const { setCurrentPage } = useAICoach()
  useEffect(() => {
    setCurrentPage(PAGE_BY_PATH[location.pathname] ?? location.pathname)
  }, [location.pathname, setCurrentPage])
}

function AppShell() {
  usePageSync()
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
        <AIBar />
      </div>
      <ConfirmationCard />
    </>
  )
}

function App() {
  return (
    <LoginGate>
      <AICoachProvider>
        <BrowserRouter>
          <AppShell />
        </BrowserRouter>
      </AICoachProvider>
    </LoginGate>
  )
}

export default App
