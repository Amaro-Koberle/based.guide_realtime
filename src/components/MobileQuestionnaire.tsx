import React, { useState, useRef, useEffect } from 'react'
import { Questionnaire } from './Questionnaire'

interface MobileQuestionnaireProps {
  onHeightChange?: (heightPercent: number) => void
}

export function MobileQuestionnaire({ onHeightChange }: MobileQuestionnaireProps) {
  const [height, setHeight] = useState(70) // Start at 70% of screen height
  const [isDragging, setIsDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const startY = useRef(0)
  const startHeight = useRef(0)
  const lastScrollTop = useRef(0)

  // Notify parent of height changes
  useEffect(() => {
    onHeightChange?.(height)
  }, [height, onHeightChange])

  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true)
    startY.current = e.touches[0].clientY
    startHeight.current = height
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return
    
    const currentY = e.touches[0].clientY
    const deltaY = startY.current - currentY
    const deltaPercent = (deltaY / window.innerHeight) * 100
    
    let newHeight = startHeight.current + deltaPercent
    newHeight = Math.max(50, Math.min(95, newHeight)) // Clamp between 50% and 95%
    
    setHeight(newHeight)
    
    // Trigger resize event immediately during drag
    window.dispatchEvent(new Event('resize'))
  }

  const handleTouchEnd = () => {
    setIsDragging(false)
  }

  // Auto-expand drawer proportionally based on scroll position
  useEffect(() => {
    const content = contentRef.current
    if (!content) return

    const handleScroll = (e: Event) => {
      const target = e.target as HTMLElement
      
      // Check if the scroll is happening in the questionnaire content
      if (!target.closest('.questionnaire-content')) return
      
      const scrollTop = target.scrollTop
      const scrollHeight = target.scrollHeight
      const clientHeight = target.clientHeight
      
      // Calculate how much content is scrollable
      const maxScroll = scrollHeight - clientHeight
      
      if (maxScroll <= 0) return // No scrollable content
      
      // Calculate scroll percentage (0 to 1)
      const scrollPercent = Math.min(scrollTop / maxScroll, 1)
      
      // Map scroll percentage to drawer height
      // Start at 70%, expand to 92% as user scrolls
      const minHeight = 70
      const maxHeight = 92
      const targetHeight = minHeight + (scrollPercent * (maxHeight - minHeight))
      
      // Only update if significantly different (avoid jitter)
      if (Math.abs(targetHeight - height) > 0.5) {
        setHeight(targetHeight)
        
        // Trigger resize for canvas
        requestAnimationFrame(() => {
          window.dispatchEvent(new Event('resize'))
        })
      }
    }

    // Listen to scroll events on the content area
    content.addEventListener('scroll', handleScroll, { passive: true, capture: true })
    return () => content.removeEventListener('scroll', handleScroll, { capture: true })
  }, [height])

  return (
    <div
      ref={containerRef}
      className="absolute inset-x-0 bottom-0 bg-white rounded-t-2xl shadow-2xl flex flex-col"
      style={{ 
        height: `${height}vh`,
        transition: isDragging ? 'none' : 'height 0.2s ease-out'
      }}
    >
      {/* Drag handle */}
      <div
        className="flex-shrink-0 py-2 cursor-grab active:cursor-grabbing"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="w-12 h-1.5 bg-stone-300 rounded-full mx-auto" />
      </div>

      {/* Questionnaire content */}
      <div ref={contentRef} className="flex-1 overflow-hidden questionnaire-content">
        <Questionnaire />
      </div>
    </div>
  )
}

