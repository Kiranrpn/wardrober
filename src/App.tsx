import { useEffect, useState } from 'react'
import { NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { ToastProvider } from './components/toast'
import { seedDefaults } from './db/db'
import { useSettings } from './lib/hooks'
import { applyTheme } from './lib/theme'
import { Onboarding } from './screens/Onboarding'
import { Today } from './screens/Today'
import { Backup } from './screens/profile/Backup'
import { Categories } from './screens/profile/Categories'
import { ClothingTypes } from './screens/profile/ClothingTypes'
import { HistoricalImport } from './screens/profile/HistoricalImport'
import { ProfileHome } from './screens/profile/ProfileHome'
import { Settings } from './screens/profile/Settings'
import { Statistics } from './screens/profile/Statistics'
import { TodaySettings } from './screens/profile/TodaySettings'
import { CompatibilityManager } from './screens/wardrobe/Compatibility'
import { GeneratePair } from './screens/wardrobe/GeneratePair'
import { ItemDetail } from './screens/wardrobe/ItemDetail'
import { ItemForm } from './screens/wardrobe/ItemForm'
import { ItemList } from './screens/wardrobe/ItemList'
import { WardrobeHome } from './screens/wardrobe/WardrobeHome'

const TABS = [
  { to: '/', label: 'Today' },
  { to: '/wardrobe', label: 'Wardrobe' },
  { to: '/profile', label: 'Profile' },
]

export default function App() {
  const settings = useSettings()
  const [ready, setReady] = useState(false)
  const [skipSetup, setSkipSetup] = useState(false)
  const { pathname } = useLocation()

  useEffect(() => {
    seedDefaults().then(() => setReady(true))
  }, [])

  useEffect(() => applyTheme(settings?.theme ?? 'system'), [settings?.theme])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  if (!ready || !settings) return <div className="app" />

  if (!settings.setupComplete && !skipSetup) {
    return (
      <ToastProvider>
        <div className="app">
          <Onboarding onDone={() => setSkipSetup(true)} />
        </div>
      </ToastProvider>
    )
  }

  return (
    <ToastProvider>
      <div className="app">
        <Routes>
          <Route path="/" element={<Today />} />
          <Route path="/wardrobe" element={<WardrobeHome />} />
          <Route path="/wardrobe/items" element={<ItemList title="All items" />} />
          <Route path="/wardrobe/items/:id" element={<ItemDetail />} />
          <Route path="/wardrobe/items/:id/edit" element={<ItemForm />} />
          <Route path="/wardrobe/add" element={<ItemForm />} />
          <Route path="/wardrobe/laundry" element={<ItemList title="Laundry" state="LAUNDRY" />} />
          <Route path="/wardrobe/repair" element={<ItemList title="Repair" state="REPAIR" />} />
          <Route path="/wardrobe/retired" element={<ItemList title="Retired" state="RETIRED" />} />
          <Route path="/wardrobe/compatibility" element={<CompatibilityManager />} />
          <Route path="/wardrobe/generate" element={<GeneratePair />} />
          <Route path="/profile" element={<ProfileHome />} />
          <Route path="/profile/today" element={<TodaySettings />} />
          <Route path="/profile/categories" element={<Categories />} />
          <Route path="/profile/types" element={<ClothingTypes />} />
          <Route path="/profile/statistics" element={<Statistics />} />
          <Route path="/profile/import" element={<HistoricalImport />} />
          <Route path="/profile/backup" element={<Backup />} />
          <Route path="/profile/settings" element={<Settings />} />
          <Route path="*" element={<Today />} />
        </Routes>

        <nav className="tabbar">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.to === '/'}
              className={({ isActive }) => (isActive ? 'active' : '')}
            >
              <span className="dot" />
              {t.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </ToastProvider>
  )
}
