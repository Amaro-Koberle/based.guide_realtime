import React, { useState } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs'
import { Progress } from './ui/progress'
import { Card, CardContent } from './ui/card'
import { Button } from './ui/button'

interface QuestionnaireStep {
  id: string
  title: string
  content: React.ReactNode
}

const mockSteps: QuestionnaireStep[] = [
  {
    id: 'personal',
    title: 'Personal Info',
    content: (
      <div className="space-y-4">
        <p className="text-sm text-stone-600 mb-4">
          [MOCK] Please provide your personal information for the immigration application.
        </p>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-2">
            Full Legal Name
          </label>
          <input
            type="text"
            placeholder="John Doe"
            className="w-full px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-2">
            Previous Names (if applicable)
          </label>
          <input
            type="text"
            placeholder="Any previous legal names"
            className="w-full px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-2">
            Date of Birth
          </label>
          <input
            type="date"
            className="w-full px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-2">
            Place of Birth
          </label>
          <input
            type="text"
            placeholder="City, Country"
            className="w-full px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-2">
            Current Nationality
          </label>
          <input
            type="text"
            placeholder="United States"
            className="w-full px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-2">
            Previous Nationalities (if applicable)
          </label>
          <input
            type="text"
            placeholder="List any previous citizenships"
            className="w-full px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-2">
            Gender
          </label>
          <select className="w-full px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500">
            <option>Select...</option>
            <option>Male</option>
            <option>Female</option>
            <option>Other</option>
            <option>Prefer not to say</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-2">
            Marital Status
          </label>
          <select className="w-full px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500">
            <option>Select...</option>
            <option>Single</option>
            <option>Married</option>
            <option>Divorced</option>
            <option>Widowed</option>
            <option>Separated</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-2">
            Current Address
          </label>
          <textarea
            placeholder="Street address, City, State/Province, Postal Code, Country"
            rows={3}
            className="w-full px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-2">
            Phone Number
          </label>
          <input
            type="tel"
            placeholder="+1 (555) 123-4567"
            className="w-full px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-2">
            Email Address
          </label>
          <input
            type="email"
            placeholder="john.doe@example.com"
            className="w-full px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
      </div>
    ),
  },
  {
    id: 'visa',
    title: 'Visa Type',
    content: (
      <div className="space-y-4">
        <p className="text-sm text-stone-600 mb-4">
          [MOCK] Select the type of visa you're applying for and provide additional details:
        </p>
        <div className="space-y-2">
          {[
            { name: 'Work Visa (H-1B)', desc: 'For specialty occupations requiring theoretical or technical expertise' },
            { name: 'Work Visa (L-1)', desc: 'For intracompany transferees in managerial or specialized knowledge positions' },
            { name: 'Work Visa (O-1)', desc: 'For individuals with extraordinary ability in sciences, arts, education, business, or athletics' },
            { name: 'Student Visa (F-1)', desc: 'For academic studies at an accredited U.S. college or university' },
            { name: 'Student Visa (M-1)', desc: 'For vocational or non-academic studies' },
            { name: 'Exchange Visitor (J-1)', desc: 'For educational and cultural exchange programs' },
            { name: 'Tourist Visa (B-2)', desc: 'For tourism, vacation, or visiting friends and relatives' },
            { name: 'Business Visitor (B-1)', desc: 'For business meetings, conferences, or negotiations' },
            { name: 'Green Card (EB-1)', desc: 'For priority workers with extraordinary ability' },
            { name: 'Green Card (EB-2)', desc: 'For professionals with advanced degrees or exceptional ability' },
            { name: 'Green Card (EB-3)', desc: 'For skilled workers, professionals, and other workers' },
            { name: 'Family-Based Immigration', desc: 'For immediate relatives of U.S. citizens or permanent residents' },
          ].map((option) => (
            <label key={option.name} className="flex items-start space-x-3 p-3 border border-stone-200 rounded-md hover:bg-stone-50 cursor-pointer">
              <input type="radio" name="visa-type" className="mt-1 text-amber-500 focus:ring-amber-500" />
              <div>
                <div className="text-stone-700 font-medium">{option.name}</div>
                <div className="text-xs text-stone-500 mt-1">{option.desc}</div>
              </div>
            </label>
          ))}
        </div>
        <div className="mt-6">
          <label className="block text-sm font-medium text-stone-700 mb-2">
            Intended Duration of Stay
          </label>
          <input
            type="text"
            placeholder="e.g., 3 years, permanent"
            className="w-full px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-2">
            Purpose of Visit/Immigration
          </label>
          <textarea
            placeholder="Please describe in detail the purpose of your visit or immigration"
            rows={4}
            className="w-full px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
      </div>
    ),
  },
  {
    id: 'employment',
    title: 'Employment',
    content: (
      <div className="space-y-4">
        <p className="text-sm text-stone-600 mb-4">
          [MOCK] Please provide detailed information about your current and previous employment.
        </p>
        
        <h3 className="font-semibold text-stone-800 mt-6 mb-3">Current Employment</h3>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-2">
            Current Employer
          </label>
          <input
            type="text"
            placeholder="Company Name"
            className="w-full px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-2">
            Employer Address
          </label>
          <textarea
            placeholder="Street address, City, State, Postal Code, Country"
            rows={2}
            className="w-full px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-2">
            Job Title
          </label>
          <input
            type="text"
            placeholder="Software Engineer"
            className="w-full px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-2">
            Job Description
          </label>
          <textarea
            placeholder="Describe your main responsibilities and duties"
            rows={3}
            className="w-full px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-2">
            Employment Start Date
          </label>
          <input
            type="date"
            className="w-full px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-2">
            Annual Salary
          </label>
          <input
            type="text"
            placeholder="$100,000"
            className="w-full px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-2">
            Supervisor Name
          </label>
          <input
            type="text"
            placeholder="Full name of your direct supervisor"
            className="w-full px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-2">
            Supervisor Contact Information
          </label>
          <input
            type="text"
            placeholder="Email and phone number"
            className="w-full px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
        
        <h3 className="font-semibold text-stone-800 mt-6 mb-3">Previous Employment (Last 5 Years)</h3>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-2">
            Previous Employer 1
          </label>
          <input
            type="text"
            placeholder="Company Name"
            className="w-full px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-2">
            Job Title
          </label>
          <input
            type="text"
            placeholder="Your position"
            className="w-full px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-2">
              Start Date
            </label>
            <input
              type="date"
              className="w-full px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-2">
              End Date
            </label>
            <input
              type="date"
              className="w-full px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
        </div>
        
        <h3 className="font-semibold text-stone-800 mt-6 mb-3">Education</h3>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-2">
            Highest Level of Education
          </label>
          <select className="w-full px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500">
            <option>Select...</option>
            <option>High School Diploma</option>
            <option>Associate's Degree</option>
            <option>Bachelor's Degree</option>
            <option>Master's Degree</option>
            <option>Doctorate (PhD)</option>
            <option>Professional Degree (MD, JD, etc.)</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-2">
            Institution Name
          </label>
          <input
            type="text"
            placeholder="University or College Name"
            className="w-full px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-2">
            Field of Study
          </label>
          <input
            type="text"
            placeholder="Major or area of concentration"
            className="w-full px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-2">
            Graduation Date
          </label>
          <input
            type="date"
            className="w-full px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
      </div>
    ),
  },
  {
    id: 'documents',
    title: 'Documents',
    content: (
      <div className="space-y-4">
        <p className="text-sm text-stone-600 mb-4">
          [MOCK] Upload all required documents. Ensure all documents are clear, legible, and in PDF or image format (JPG, PNG).
        </p>
        
        <h3 className="font-semibold text-stone-800 mt-6 mb-3">Identity Documents</h3>
        <div className="space-y-3">
          {[
            { name: 'Passport Copy', desc: 'All pages including blank pages', required: true },
            { name: 'Birth Certificate', desc: 'Official copy with translation if not in English', required: true },
            { name: 'National ID Card', desc: 'Front and back (if applicable)', required: false },
            { name: 'Driver\'s License', desc: 'Front and back', required: false },
          ].map((doc) => (
            <div key={doc.name} className="p-4 border-2 border-dashed border-stone-300 rounded-md hover:border-amber-400 transition-colors">
              <div className="flex items-center justify-between mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-stone-700">{doc.name}</span>
                    {doc.required && <span className="text-xs text-red-600 font-medium">*Required</span>}
                  </div>
                  <p className="text-xs text-stone-500 mt-1">{doc.desc}</p>
                </div>
                <Button variant="outline" size="sm">Upload</Button>
              </div>
            </div>
          ))}
        </div>
        
        <h3 className="font-semibold text-stone-800 mt-6 mb-3">Employment Documents</h3>
        <div className="space-y-3">
          {[
            { name: 'Employment Letter', desc: 'On company letterhead, signed by authorized personnel', required: true },
            { name: 'Employment Contract', desc: 'Current employment agreement', required: true },
            { name: 'Pay Stubs', desc: 'Last 3 months of salary statements', required: true },
            { name: 'Tax Returns', desc: 'Last 2 years of tax filings', required: true },
            { name: 'Resume/CV', desc: 'Current curriculum vitae', required: true },
          ].map((doc) => (
            <div key={doc.name} className="p-4 border-2 border-dashed border-stone-300 rounded-md hover:border-amber-400 transition-colors">
              <div className="flex items-center justify-between mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-stone-700">{doc.name}</span>
                    {doc.required && <span className="text-xs text-red-600 font-medium">*Required</span>}
                  </div>
                  <p className="text-xs text-stone-500 mt-1">{doc.desc}</p>
                </div>
                <Button variant="outline" size="sm">Upload</Button>
              </div>
            </div>
          ))}
        </div>
        
        <h3 className="font-semibold text-stone-800 mt-6 mb-3">Financial Documents</h3>
        <div className="space-y-3">
          {[
            { name: 'Bank Statements', desc: 'Last 6 months from all accounts', required: true },
            { name: 'Investment Statements', desc: 'Stocks, bonds, retirement accounts', required: false },
            { name: 'Property Ownership', desc: 'Deeds, mortgage statements', required: false },
            { name: 'Sponsorship Letter', desc: 'If applicable, from sponsor with financial proof', required: false },
          ].map((doc) => (
            <div key={doc.name} className="p-4 border-2 border-dashed border-stone-300 rounded-md hover:border-amber-400 transition-colors">
              <div className="flex items-center justify-between mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-stone-700">{doc.name}</span>
                    {doc.required && <span className="text-xs text-red-600 font-medium">*Required</span>}
                  </div>
                  <p className="text-xs text-stone-500 mt-1">{doc.desc}</p>
                </div>
                <Button variant="outline" size="sm">Upload</Button>
              </div>
            </div>
          ))}
        </div>
        
        <h3 className="font-semibold text-stone-800 mt-6 mb-3">Education Documents</h3>
        <div className="space-y-3">
          {[
            { name: 'Diplomas/Degrees', desc: 'All educational certificates', required: true },
            { name: 'Transcripts', desc: 'Official academic records', required: true },
            { name: 'Credential Evaluation', desc: 'Foreign degree evaluation (if applicable)', required: false },
            { name: 'Professional Licenses', desc: 'Any relevant certifications', required: false },
          ].map((doc) => (
            <div key={doc.name} className="p-4 border-2 border-dashed border-stone-300 rounded-md hover:border-amber-400 transition-colors">
              <div className="flex items-center justify-between mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-stone-700">{doc.name}</span>
                    {doc.required && <span className="text-xs text-red-600 font-medium">*Required</span>}
                  </div>
                  <p className="text-xs text-stone-500 mt-1">{doc.desc}</p>
                </div>
                <Button variant="outline" size="sm">Upload</Button>
              </div>
            </div>
          ))}
        </div>
        
        <h3 className="font-semibold text-stone-800 mt-6 mb-3">Additional Documents</h3>
        <div className="space-y-3">
          {[
            { name: 'Photographs', desc: 'Passport-style photos (2x2 inches)', required: true },
            { name: 'Marriage Certificate', desc: 'If applicable', required: false },
            { name: 'Police Clearance', desc: 'From all countries of residence', required: true },
            { name: 'Medical Examination', desc: 'From approved physician', required: true },
            { name: 'Previous Visa/Immigration Documents', desc: 'Any prior applications or approvals', required: false },
          ].map((doc) => (
            <div key={doc.name} className="p-4 border-2 border-dashed border-stone-300 rounded-md hover:border-amber-400 transition-colors">
              <div className="flex items-center justify-between mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-stone-700">{doc.name}</span>
                    {doc.required && <span className="text-xs text-red-600 font-medium">*Required</span>}
                  </div>
                  <p className="text-xs text-stone-500 mt-1">{doc.desc}</p>
                </div>
                <Button variant="outline" size="sm">Upload</Button>
              </div>
            </div>
          ))}
        </div>
        
        <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-md">
          <p className="text-sm text-amber-800">
            <strong>Note:</strong> All documents must be in English or accompanied by certified translations. 
            Ensure all uploads are clear and legible. Maximum file size: 10MB per document.
          </p>
        </div>
      </div>
    ),
  },
]

export function Questionnaire() {
  const [currentStep, setCurrentStep] = useState(0)
  const [activeTab, setActiveTab] = useState(mockSteps[0].id)

  const progress = ((currentStep + 1) / mockSteps.length) * 100

  const handleNext = () => {
    if (currentStep < mockSteps.length - 1) {
      const nextStep = currentStep + 1
      setCurrentStep(nextStep)
      setActiveTab(mockSteps[nextStep].id)
    }
  }

  const handlePrevious = () => {
    if (currentStep > 0) {
      const prevStep = currentStep - 1
      setCurrentStep(prevStep)
      setActiveTab(mockSteps[prevStep].id)
    }
  }

  return (
    <div className="w-full h-full bg-stone-50 overflow-y-auto">
      <Card className="border-0 rounded-none shadow-lg h-full flex flex-col">
        {/* Header */}
        <div className="border-b border-stone-200 p-4 bg-white">
          <h1 className="text-lg font-semibold text-stone-800 mb-2">
            Ape Escape Consulting Questionnaire
          </h1>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-stone-500">
              Step {currentStep + 1} of {mockSteps.length} • Progress: {Math.round(progress)}%
            </p>
            <p className="text-xs text-amber-600 font-medium">
              [MOCKUP]
            </p>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Tabs Navigation */}
        <div className="border-b border-stone-200 bg-white px-4 pt-4">
          <Tabs value={activeTab} onValueChange={(value) => {
            setActiveTab(value)
            const stepIndex = mockSteps.findIndex(s => s.id === value)
            if (stepIndex !== -1) setCurrentStep(stepIndex)
          }}>
            <TabsList className="w-full justify-start">
              {mockSteps.map((step, index) => (
                <TabsTrigger
                  key={step.id}
                  value={step.id}
                  className="flex items-center gap-2 flex-shrink-0"
                >
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                    index <= currentStep 
                      ? 'bg-amber-500 text-white' 
                      : 'bg-stone-200 text-stone-500'
                  }`}>
                    {index + 1}
                  </span>
                  <span className="hidden sm:inline">{step.title}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {/* Content */}
        <CardContent className="flex-1 p-6 overflow-y-auto">
          <Tabs value={activeTab}>
            {mockSteps.map((step) => (
              <TabsContent key={step.id} value={step.id}>
                <div className="max-w-2xl">
                  <h2 className="text-xl font-semibold text-stone-800 mb-4">
                    {step.title}
                  </h2>
                  {step.content}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>

        {/* Footer Navigation */}
        <div className="border-t border-stone-200 p-4 bg-white flex justify-between items-center">
          <Button
            variant="outline"
            onClick={handlePrevious}
            disabled={currentStep === 0}
          >
            Previous
          </Button>
          <div className="text-sm text-stone-500">
            {currentStep + 1} / {mockSteps.length}
          </div>
          <Button
            onClick={handleNext}
            disabled={currentStep === mockSteps.length - 1}
          >
            {currentStep === mockSteps.length - 1 ? 'Submit' : 'Next'}
          </Button>
        </div>
      </Card>
    </div>
  )
}

