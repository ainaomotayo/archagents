import { describe, it, expect } from "vitest";
import { TopicTrie } from "../trie.js";

describe("TopicTrie", () => {
  it("matches exact topic", () => {
    const trie = new TopicTrie<string>();
    trie.add("scan.completed", "ep-1");
    trie.add("scan.failed", "ep-2");
    expect(trie.match("scan.completed")).toEqual(["ep-1"]);
    expect(trie.match("scan.failed")).toEqual(["ep-2"]);
  });

  it("matches wildcard at segment level", () => {
    const trie = new TopicTrie<string>();
    trie.add("scan.*", "ep-wild");
    trie.add("scan.completed", "ep-exact");
    const matches = trie.match("scan.completed");
    expect(matches).toContain("ep-wild");
    expect(matches).toContain("ep-exact");
  });

  it("matches global wildcard", () => {
    const trie = new TopicTrie<string>();
    trie.add("*", "ep-global");
    trie.add("scan.completed", "ep-exact");
    const matches = trie.match("scan.completed");
    expect(matches).toContain("ep-global");
    expect(matches).toContain("ep-exact");
  });

  it("returns empty array for no matches", () => {
    const trie = new TopicTrie<string>();
    trie.add("scan.completed", "ep-1");
    expect(trie.match("finding.created")).toEqual([]);
  });

  it("deduplicates subscribers matched via multiple paths", () => {
    const trie = new TopicTrie<string>();
    trie.add("scan.completed", "ep-1");
    trie.add("scan.*", "ep-1");
    const matches = trie.match("scan.completed");
    expect(matches).toEqual(["ep-1"]);
  });

  it("handles multi-level topics", () => {
    const trie = new TopicTrie<string>();
    trie.add("compliance.report_ready", "ep-1");
    trie.add("compliance.*", "ep-2");
    expect(trie.match("compliance.report_ready")).toContain("ep-1");
    expect(trie.match("compliance.report_ready")).toContain("ep-2");
    expect(trie.match("compliance.assessed")).toEqual(["ep-2"]);
  });

  it("removes a subscriber from a topic", () => {
    const trie = new TopicTrie<string>();
    trie.add("scan.completed", "ep-1");
    trie.add("scan.completed", "ep-2");
    trie.remove("scan.completed", "ep-1");
    expect(trie.match("scan.completed")).toEqual(["ep-2"]);
  });

  it("clears all subscribers", () => {
    const trie = new TopicTrie<string>();
    trie.add("scan.completed", "ep-1");
    trie.add("finding.*", "ep-2");
    trie.clear();
    expect(trie.match("scan.completed")).toEqual([]);
    expect(trie.match("finding.created")).toEqual([]);
  });
});
