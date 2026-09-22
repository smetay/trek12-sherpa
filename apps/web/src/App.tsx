import { useRoute } from './lib/router.ts'
import { HomePage } from './pages/HomePage.tsx'
import { PerfPage } from './pages/PerfPage.tsx'
import { PlayPage } from './pages/PlayPage.tsx'
import { SettingsPage } from './pages/SettingsPage.tsx'
import { VerifyMapPage } from './pages/VerifyMapPage.tsx'
import { ReloadPrompt } from './ReloadPrompt.tsx'

function Page() {
  const route = useRoute()
  switch (route.name) {
    case 'verify':
      return <VerifyMapPage mapId={route.mapId} />
    case 'perf':
      return <PerfPage />
    case 'play':
      return <PlayPage />
    case 'settings':
      return <SettingsPage />
    default:
      return <HomePage />
  }
}

export function App() {
  return (
    <>
      <Page />
      <ReloadPrompt />
    </>
  )
}
