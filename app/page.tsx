"use client"

import HeroSection from "@/hero-section"
import { Timeline } from "@/components/ui/timeline"
import "./globals.css"
import { motion } from "framer-motion"
import SmoothScrollHero from "@/components/ui/smooth-scroll-hero"
import Chatbot from "@/components/chabot"
import { Upload, Bot, TrendingUp, ChevronLeft, ChevronRight } from "lucide-react"
import { useEffect, useState } from "react"

export default function Page() {
  const timelineEntries = [
    {
      id: 1,
      image: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-RJ3iTXUn5SUexF6nHMZYhMoQLNCboK.png",
      alt: "Woman runner in artistic motion blur",
      title: "Every Move Counts",
      description:
        "From your first practice session to competing at the highest level, every athlete has a story. At Pragati, we celebrate beginners taking their first step and champions chasing new goals. Your level doesn’t matter—your dedication does. What are you waiting for?",
      layout: "left" as const,
    },
    {
      id: 2,
      image: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-LN9OPh9hw0b9rwSPRSslHoejcfoKHe.png",
      alt: "Male runner with determination and focus",
      title: "Find Your Path",
      description:
        "No two athletes are the same. Some rise through discipline, others through creativity—but each story matters. At Pragati, we celebrate diversity in sport and provide a home for every dreamer and doer. What are you waiting for?",
      layout: "right" as const,
    },
    {
      id: 3,
      image: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-1FdGyjVpWQANGzsDWpoPIvF5SVI2za.png",
      alt: "Runner in dynamic motion showing strength and grace",
      title: "Join the Movement",
      description:
        "Being an athlete isn’t just about competition—it’s about connection. The encouragement, the lessons, the collective drive to get better. At Pragati, you’re joining a family where every effort counts. So step in, and start your journey today.",
      layout: "left" as const,
    },
  ]

  const missionCards = [
    {
      title: "Empower Rural Talent",
      body: "Identify and nurture athletes from villages and low-income communities.",
      image: "/young-athletes-training-in-rural-india-sports-fiel.jpg",
    },
    {
      title: "AI Video Analysis",
      body: "Upload training videos—get ML-driven insights to improve technique fast.",
      image: "/young-female-badminton-player.jpg",
    },
    {
      title: "Pathways to Excellence",
      body: "Support progress from grassroots to national and international levels.",
      image: "/young-male-football-player.jpg",
    },
  ]

  const howItWorks = [
    {
      icon: Upload,
      title: "Upload",
      body: "Choose your sport, record a clear video, and upload in seconds.",
    },
    {
      icon: Bot,
      title: "AI Analyzes",
      body: "Computer vision models evaluate form, posture, and key phases.",
    },
    {
      icon: TrendingUp,
      title: "Improve",
      body: "Get recommendations to refine technique and track progress.",
    },
  ]

  const [stepIndex, setStepIndex] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setStepIndex((i) => (i + 1) % howItWorks.length), 4500)
    return () => clearInterval(id)
  }, [howItWorks.length])

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <HeroSection />

      {/* Mission Section - three interactive image cards */}
      <section id="mission" className="relative py-20 bg-white">
        <div className="absolute inset-0 bg-grid-subtle opacity-30 pointer-events-none" />
        <div className="container mx-auto px-6 relative z-10">
          <div className="max-w-4xl mx-auto text-center mb-12">
            <h2 className="text-4xl md:text-6xl font-black tracking-wider mb-4 text-gray-900">OUR MISSION</h2>
            <p className="text-lg md:text-xl text-gray-700">
              Pragati empowers children from villages and underprivileged backgrounds to excel in sports.
            </p>
          </div>

          <div className="grid gap-6 sm:gap-8 sm:grid-cols-2 lg:grid-cols-3 max-w-6xl mx-auto">
            {missionCards.map((card, i) => (
              <motion.div
                key={card.title}
                initial={{ opacity: 0, y: 30, scale: 0.98 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.7, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }}
                viewport={{ once: true }}
                className="relative h-72 rounded-2xl overflow-hidden group shadow-sm"
              >
                <motion.div
                  className="absolute inset-0 bg-center bg-cover"
                  style={{ backgroundImage: `url(${card.image})` }}
                  initial={{ scale: 1.05 }}
                  whileHover={{ scale: 1.1 }}
                  transition={{ duration: 0.6 }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-5">
                  <h3 className="text-white text-xl font-bold tracking-wide mb-1">{card.title}</h3>
                  <p className="text-gray-200 text-sm leading-relaxed">{card.body}</p>
                </div>
                <div className="absolute inset-0 ring-1 ring-black/10 rounded-2xl" />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Timeline Section */}
      <section id="community" className="relative py-20 bg-white">
        <div className="absolute inset-0 bg-grid-subtle opacity-30 pointer-events-none" />

        <div className="relative z-10">
          <div className="container mx-auto px-6 mb-16">
            <div className="text-center">
              <h2 className="text-4xl md:text-6xl font-black tracking-wider mb-6 text-gray-900">ALL ATHLETES WELCOME</h2>
              <p className="text-xl md:text-2xl text-gray-600 max-w-3xl mx-auto">
              Every athlete has a story of passion, struggle, and growth. Here are a few from our thriving community.
              </p>
            </div>
          </div>

          <Timeline entries={timelineEntries} />
        </div>
      </section>

      {/* How It Works Section - slider */}
      <section id="how-it-works" className="relative py-20 bg-white">
        <div className="absolute inset-0 bg-grid-subtle opacity-30 pointer-events-none" />

        <div className="container mx-auto px-6 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-4xl md:text-6xl font-black tracking-wider text-gray-900 mb-6">HOW IT WORKS</h2>
            <p className="text-xl md:text-2xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
              Upload your practice video. Our AI analyzes your movement. Get clear, actionable insights.
            </p>
          </motion.div>

          <div className="relative max-w-3xl mx-auto">
            <motion.div
              key={stepIndex}
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
              className="rounded-2xl border border-gray-200 p-8 bg-white shadow-sm text-center"
            >
              <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                {(() => { const Icon = howItWorks[stepIndex].icon as any; return <Icon className="w-7 h-7 text-gray-800" /> })()}
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">{howItWorks[stepIndex].title}</h3>
              <p className="text-gray-600">{howItWorks[stepIndex].body}</p>
            </motion.div>

            {/* Controls */}
            <div className="flex items-center justify-between mt-6">
              <button
                onClick={() => setStepIndex((i) => (i - 1 + howItWorks.length) % howItWorks.length)}
                className="p-2 rounded-full border border-gray-200 hover:bg-gray-50"
                aria-label="Previous"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-2">
                {howItWorks.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setStepIndex(i)}
                    className={`w-2.5 h-2.5 rounded-full transition-all ${i === stepIndex ? "bg-gray-900 w-6" : "bg-gray-300"}`}
                    aria-label={`Go to step ${i + 1}`}
                  />
                ))}
              </div>
              <button
                onClick={() => setStepIndex((i) => (i + 1) % howItWorks.length)}
                className="p-2 rounded-full border border-gray-200 hover:bg-gray-50"
                aria-label="Next"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Smooth Scroll Hero with CTA Overlay */}
      <section id="join" className="relative">
        <SmoothScrollHero
          scrollHeight={2500}
          desktopImage="/young-female-badminton-player.jpg"
          mobileImage="/young-female-badminton-player.jpg"
          initialClipPercentage={30}
          finalClipPercentage={70}
        />
      </section>
      <Chatbot />
    </div>
  )
}