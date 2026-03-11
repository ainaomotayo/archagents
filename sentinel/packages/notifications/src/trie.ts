interface TrieNode<T> {
  children: Map<string, TrieNode<T>>;
  subscribers: Set<T>;
}

function createNode<T>(): TrieNode<T> {
  return { children: new Map(), subscribers: new Set() };
}

export class TopicTrie<T> {
  private root: TrieNode<T> = createNode();

  add(pattern: string, subscriber: T): void {
    const segments = pattern.split(".");
    let node = this.root;
    for (const seg of segments) {
      if (!node.children.has(seg)) {
        node.children.set(seg, createNode());
      }
      node = node.children.get(seg)!;
    }
    node.subscribers.add(subscriber);
  }

  remove(pattern: string, subscriber: T): void {
    const segments = pattern.split(".");
    let node = this.root;
    for (const seg of segments) {
      const child = node.children.get(seg);
      if (!child) return;
      node = child;
    }
    node.subscribers.delete(subscriber);
  }

  match(topic: string): T[] {
    const segments = topic.split(".");
    const results = new Set<T>();
    this.walk(this.root, segments, 0, results);
    return [...results];
  }

  clear(): void {
    this.root = createNode();
  }

  private walk(
    node: TrieNode<T>,
    segments: string[],
    depth: number,
    results: Set<T>,
  ): void {
    if (depth === segments.length) {
      for (const sub of node.subscribers) results.add(sub);
      return;
    }

    const seg = segments[depth];

    const exact = node.children.get(seg);
    if (exact) this.walk(exact, segments, depth + 1, results);

    const wildcard = node.children.get("*");
    if (wildcard) {
      // A wildcard matches the current segment; collect its subscribers
      // (covers both last-segment and mid-topic wildcards)
      for (const sub of wildcard.subscribers) results.add(sub);
      // Also continue walking deeper if there are more segments
      if (depth < segments.length - 1) {
        this.walk(wildcard, segments, depth + 1, results);
      }
    }
  }
}
