export const APP_NAME = 'Zenvy AI';

export const ROLES = {
  OWNER: 'owner',
  ADMIN: 'admin',
  MEMBER: 'member',
} as const;

export const ORDER_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  PROCESSING: 'processing',
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
} as const;

export const PRODUCT_STATUS = {
  ACTIVE: 'active',
  DRAFT: 'draft',
  ARCHIVED: 'archived',
} as const;

export const CONVERSATION_STATUS = {
  OPEN: 'open',
  AI_HANDLING: 'ai_handling',
  AGENT_ASSIGNED: 'agent_assigned',
  RESOLVED: 'resolved',
} as const;
