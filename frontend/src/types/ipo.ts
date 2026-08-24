export interface IPOEvent {
  id: string;
  ticker: string;
  name: string;
  sector: string;
  price: number;
  totalShares: number;
  openTime: number;
  closeTime: number;
  allotmentType: 'pro-rata' | 'fcfs';
  status: 'upcoming' | 'open' | 'closed' | 'allotted' | 'listed';
}

export interface IPOSubscription {
  uid: string;
  requestedShares: number;
  allocatedShares: number;
  investedAmount: number;
  timestamp: number;
  status: 'pending' | 'success' | 'refunded';
}