import { TopicTrie } from "./trie.js";
import type { SseClient, NotificationEvent } from "./types.js";

interface OrgBucket {
  clients: Map<string, SseClient>;
  trie: TopicTrie<string>;
}

export class SseManager {
  private orgs = new Map<string, OrgBucket>();

  register(client: SseClient): void {
    let bucket = this.orgs.get(client.orgId);
    if (!bucket) {
      bucket = { clients: new Map(), trie: new TopicTrie() };
      this.orgs.set(client.orgId, bucket);
    }
    bucket.clients.set(client.id, client);
    for (const topic of client.topics) {
      bucket.trie.add(topic, client.id);
    }
  }

  unregister(clientId: string, orgId: string): void {
    const bucket = this.orgs.get(orgId);
    if (!bucket) return;
    const client = bucket.clients.get(clientId);
    if (!client) return;
    bucket.clients.delete(clientId);
    for (const topic of client.topics) {
      bucket.trie.remove(topic, clientId);
    }
    if (bucket.clients.size === 0) {
      this.orgs.delete(orgId);
    }
  }

  broadcast(event: NotificationEvent): void {
    const bucket = this.orgs.get(event.orgId);
    if (!bucket) return;
    const matchedIds = bucket.trie.match(event.topic);
    const ssePayload = `event: ${event.topic}\nid: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`;
    for (const clientId of matchedIds) {
      const client = bucket.clients.get(clientId);
      if (!client) continue;
      const ok = client.write(ssePayload);
      if (!ok) {
        client.close();
        this.unregister(clientId, event.orgId);
      }
    }
  }

  connectionCount(orgId: string): number {
    return this.orgs.get(orgId)?.clients.size ?? 0;
  }
}
