import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';

export interface InboxEvent {
  type: 'new_message' | 'new_conversation' | 'conversation_updated';
  conversationId: string;
  channelId: string;
}

@Injectable()
export class InboxEventService {
  private readonly emitter = new EventEmitter();
  private readonly maxListeners = 100;

  constructor() {
    this.emitter.setMaxListeners(this.maxListeners);
  }

  emitNewMessage(
    organizationId: string,
    payload: { conversationId: string; channelId: string },
  ) {
    this.emitter.emit(`org:${organizationId}`, {
      type: 'new_message',
      ...payload,
    } as InboxEvent);
  }

  emitConversationUpdated(
    organizationId: string,
    payload: { conversationId: string; channelId: string },
  ) {
    this.emitter.emit(`org:${organizationId}`, {
      type: 'conversation_updated',
      ...payload,
    } as InboxEvent);
  }

  subscribe(
    organizationId: string,
    callback: (event: InboxEvent) => void,
  ): () => void {
    const handler = (event: InboxEvent) => callback(event);
    this.emitter.on(`org:${organizationId}`, handler);
    return () => this.emitter.off(`org:${organizationId}`, handler);
  }
}
