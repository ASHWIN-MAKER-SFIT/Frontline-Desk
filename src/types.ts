/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Customer {
  id: string;
  name: string;
  accountType: string;
  status: 'Verified' | 'Unverified' | 'Flagged';
  lastVisit: string;
}

export interface Message {
  id: string;
  role: 'user' | 'model' | 'system';
  text: string;
  translation?: string;
  timestamp: Date;
  isSensitive?: boolean;
}

export interface BankingProcess {
  id: string;
  name: string;
  category: 'Onboarding' | 'Lending' | 'Service';
  steps: {
    label: string;
    required: boolean;
    description: string;
  }[];
}

export const BANKING_PROCESSES: BankingProcess[] = [
  {
    id: 'account-opening',
    name: 'New Account Opening',
    category: 'Onboarding',
    steps: [
      { label: 'Identity Verification', required: true, description: 'Scan Passport or National ID' },
      { label: 'Address Proof', required: true, description: 'Utility bill or bank statement < 3 months' },
      { label: 'Source of Wealth', required: true, description: 'Employment contract or business records' },
      { label: 'KYC Questionnaire', required: true, description: 'Complete risk assessment form' },
      { label: 'Initial Funding', required: false, description: 'Minimum deposit of $100' }
    ]
  },
  {
    id: 'mortgage-enquiry',
    name: 'Mortgage Application',
    category: 'Lending',
    steps: [
      { label: 'Credit Score Check', required: true, description: 'Internal and external credit bureau pull' },
      { label: 'Income Verification', required: true, description: 'Last 3 months payslips' },
      { label: 'Property Valuation', required: true, description: 'Schedule appraisal for the target property' },
      { label: 'Down Payment Proof', required: true, description: 'Statement showing available funds' }
    ]
  },
  {
    id: 'fraud-report',
    name: 'Report Fraud/Lost Card',
    category: 'Service',
    steps: [
      { label: 'Identify Transactions', required: true, description: 'Select unauthorized charges' },
      { label: 'Block Card', required: true, description: 'Immediate suspension of all card activities' },
      { label: 'Issue Replacement', required: false, description: 'Order new card to registered address' },
      { label: 'Police Report', required: false, description: 'Advise customer to file official report' }
    ]
  }
];

export const SUPPORTED_LANGUAGES = [
  { code: 'en-US', name: 'English' },
  { code: 'es-ES', name: 'Spanish' },
  { code: 'fr-FR', name: 'French' },
  { code: 'de-DE', name: 'German' },
  { code: 'hi-IN', name: 'Hindi' },
  { code: 'zh-CN', name: 'Mandarin' },
  { code: 'ja-JP', name: 'Japanese' },
  { code: 'ar-SA', name: 'Arabic' }
];
