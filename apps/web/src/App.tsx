import { useRoute } from './lib/router.ts'
import { HomePage } from './pages/HomePage.tsx'
import { VerifyMapPage } from './pages/VerifyMapPage.tsx'
import { ReloadPrompt } from './ReloadPrompt.tsx'

export function App() {
  const route = useRoute()
  return (
    <>
      {route.name === 'verify' ? <VerifyMapPage mapId={route.mapId} /> : <HomePage />}
      <ReloadPrompt />
    </>
  )
}
