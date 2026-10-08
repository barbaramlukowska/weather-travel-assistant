import type { Memory, MemoryFact } from './schema';

// One source of truth for how a preference reads — the system prompt, the
// chat card, the panel and the eval assertions all use it, so the model and
// the user see the same words. Pure and type-only imports: the browser and
// the server both load it.

// Facts in the fixed category order (MEMORY_CATEGORIES), so the prompt block
// and the panel never depend on the order things were saved in. Written out
// per category, so each value keeps its own type without a cast.
export function memoryFacts(memory: Memory): MemoryFact[] {
  const facts: MemoryFact[] = [];
  if (memory.homeCity) facts.push({ category: 'homeCity', value: memory.homeCity });
  if (memory.climate) facts.push({ category: 'climate', value: memory.climate });
  if (memory.travelParty) facts.push({ category: 'travelParty', value: memory.travelParty });
  if (memory.interests) facts.push({ category: 'interests', value: memory.interests });
  if (memory.avoid) facts.push({ category: 'avoid', value: memory.avoid });
  return facts;
}

// "long-walks" is a stable id; people read "long walks".
const tagText = (tags: readonly string[]) => tags.map((tag) => tag.replace(/-/g, ' ')).join(', ');

export function formatFact(fact: MemoryFact): string {
  switch (fact.category) {
    case 'homeCity':
      return `${fact.value.name}, ${fact.value.country}`;
    case 'climate': {
      const { minComfortC: min, maxComfortC: max } = fact.value;
      if (min !== undefined && max !== undefined) return `comfortable between ${min} and ${max} °C`;
      if (max !== undefined) return `comfortable up to ${max} °C`;
      return `comfortable from ${min} °C`;
    }
    case 'travelParty': {
      const { withPartner, childrenAges, pets } = fact.value;
      const parts = [
        ...(withPartner ? ['with a partner'] : []),
        ...(childrenAges.length > 0 ? [`children aged ${childrenAges.join(', ')}`] : []),
        ...(pets.length > 0 ? [`pets: ${pets.join(', ')}`] : []),
      ];
      return parts.length > 0 ? parts.join('; ') : 'travels solo';
    }
    case 'interests':
    case 'avoid':
      return tagText(fact.value);
  }
}

// What the header badge counts: one per filled category plus one per note —
// ten notes are ten things remembered, not one "notes" category.
export function countSavedItems(memory: Memory): number {
  return memoryFacts(memory).length + (memory.notes?.length ?? 0);
}
