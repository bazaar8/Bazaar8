export interface NewsEventAdmin {
  id: string;
  headline: string;
  description: string;
  targetTickers: string[];
  affectedSectors: string[];
  impactDirection: 'positive' | 'negative' | 'neutral';
  impactStrength: number;
  durationMinutes: 15 | 30;
  startTime: number;
  status: 'scheduled' | 'active' | 'completed' | 'cancelled';
  createdAt: number;
}

export interface NewsEventPublic {
  id: string;
  headline: string;
  description: string;
  targetTickers: string[];
  affectedSectors: string[];
  startTime: number;
}

export interface MarketInfluence {
  id: string;
  targetTickers: string[];
  impactDirection: 'positive' | 'negative' | 'neutral';
  impactStrength: number;
  durationMinutes: 15 | 30;
  startTime: number;
  status: 'active' | 'paused';
}