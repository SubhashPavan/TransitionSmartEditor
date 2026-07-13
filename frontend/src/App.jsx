import { useEffect, useState } from 'react'
import Landing from './pages/Landing'
import Editor from './pages/Editor'
import Reviewer from './pages/Reviewer'

export default function App() {
  // Simple pathname-based routing — /review/<token> opens the reviewer page,
  // everything else falls through to the authoring flow (landing → editor).
  const [route, setRoute] = useState(() => parseRoute(window.location.pathname))
  useEffect(() => {
    const onPop = () => setRoute(parseRoute(window.location.pathname))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  if (route.name === 'review') {
    return <Reviewer token={route.token} />
  }

  return <AuthoringApp />
}

function parseRoute(pathname) {
  const m = pathname.match(/^\/review\/([^/?#]+)/)
  if (m) return { name: 'review', token: m[1] }
  return { name: 'author' }
}

function AuthoringApp() {
  const [view, setView] = useState('landing')
  const [uploadedDoc, setUploadedDoc] = useState(null)

  return view === 'landing'
    ? <Landing onEnter={(doc) => { setUploadedDoc(doc); setView('editor') }} />
    : <Editor
        uploadedDoc={uploadedDoc}
        onExit={() => { setUploadedDoc(null); setView('landing') }}
      />
}
