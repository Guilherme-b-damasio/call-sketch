import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'motion/react'
import { App } from './App'
import './styles.css'

if (window.api.isOverlay) document.documentElement.classList.add('overlay')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user" transition={{ type: 'spring', stiffness: 420, damping: 34 }}>
      <App />
    </MotionConfig>
  </StrictMode>,
)
