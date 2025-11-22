import React, { useState, useEffect } from 'react'
import { Questionnaire } from './components/Questionnaire'
import { MobileQuestionnaire } from './components/MobileQuestionnaire'

export function App() {
  const [isMobile, setIsMobile] = useState(false)
  const [drawerHeight, setDrawerHeight] = useState(70)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const handleDrawerHeightChange = (heightPercent: number) => {
    setDrawerHeight(heightPercent)
  }
  
  // Trigger canvas resize whenever drawer height changes
  useEffect(() => {
    if (isMobile) {
      // Small delay to ensure DOM has updated before triggering resize
      const timer = setTimeout(() => {
        window.dispatchEvent(new Event('resize'))
      }, 10)
      return () => clearTimeout(timer)
    }
  }, [drawerHeight, isMobile])

  if (isMobile) {
    // Mobile layout with expandable questionnaire
    
    return (
      <div className="h-screen w-screen overflow-hidden relative">
        {/* 3D Scene - dynamically sized based on drawer */}
        <div 
          className="absolute inset-x-0 top-0"
          style={{ 
            height: `${100 - drawerHeight}vh`,
            transition: 'height 0.2s ease-out'
          }}
        >
          <canvas id="c" className="w-full h-full block" />
        </div>
        
        {/* Questionnaire - draggable overlay */}
        <MobileQuestionnaire onHeightChange={handleDrawerHeightChange} />
      </div>
    )
  }

  // Desktop layout - side by side
  return (
    <div className="h-screen w-screen overflow-hidden flex">
      {/* Questionnaire - left (1/3) */}
      <div className="w-1/3 h-full overflow-hidden bg-white">
        <Questionnaire />
      </div>
      
      {/* 3D Scene - right (2/3) */}
      <div className="w-2/3 h-full relative">
        <canvas id="c" className="w-full h-full block" />
      </div>
    </div>
  )
}

