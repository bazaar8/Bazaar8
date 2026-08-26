export interface NewsEventAdmin {
  id: string;
  headline: string;
  stockImpacts: Record<string, number>;
  durationMinutes: number;
  startTime: number;
  status: 'draft' | 'active' | 'completed' | 'cancelled';
  createdAt: number;
}

export interface NewsEventPublic {
  id: string;
  headline: string;
  startTime: number;
}

export interface MarketInfluence {
  id: string;
  impacts: Record<string, number>;
  durationMinutes: number;
  startTime: number;
  status: 'active' | 'paused';
}