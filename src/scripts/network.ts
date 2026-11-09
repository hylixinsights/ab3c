import { select } from 'd3-selection';
import data from '../data/network.json';
import { networkLabels as labels } from '../data/network-labels';

type Language = 'pt' | 'en';
type NetworkNode = { id: string; type: 'person' | 'topic'; label: Record<Language, string>; x?: number; y?: number };
type PositionedNode = NetworkNode & { x: number; y: number };
type NetworkLink = { source: string; target: string };

/**
 * Browser-only D3 rendering, loaded by the page when this region approaches view.
 * Nothing moves by itself: the visitor's click, tap or keyboard focus selects a point and its
 * connections light up. Colours come from the page's own tokens, so the network follows its ground.
 * Replace network.json with { nodes, links }; coordinates are optional.
 */
export function mountNetwork(root: HTMLElement, language: Language) {
  let lang = language;
  let selectedId: string | null = null;
  const graph = data as { nodes: NetworkNode[]; links: NetworkLink[] };
  const nodes: PositionedNode[] = graph.nodes.map((node, index) => {
    const angle = (index / Math.max(graph.nodes.length, 1)) * Math.PI * 2 - Math.PI / 2;
    return { ...node, x: node.x ?? 430 + Math.cos(angle) * 330, y: node.y ?? 270 + Math.sin(angle) * 210 };
  });
  const originalPositions = new Map(nodes.map(({ id, x, y }) => [id, { x, y }]));
  const lookup = new Map(nodes.map((node) => [node.id, node]));
  const links = graph.links.filter((link) => lookup.has(link.source) && lookup.has(link.target));
  const neighbors = (id: string) => new Set(links.flatMap((link) => link.source === id ? [link.target] : link.target === id ? [link.source] : []));
  const label = (node: NetworkNode) => node.label[lang];
  const title = (node: NetworkNode) => `${labels[lang][node.type]}: ${label(node)}`;

  root.classList.add('ab3c-network');

  const svg = select(root).append('svg').attr('viewBox', '0 0 860 540').attr('role', 'group');
  const edgeGroup = svg.append('g').attr('class', 'network-edges').attr('aria-hidden', 'true');
  const edges = edgeGroup.selectAll('line').data(links).join('line')
    .attr('x1', (d) => lookup.get(d.source)!.x).attr('y1', (d) => lookup.get(d.source)!.y)
    .attr('x2', (d) => lookup.get(d.target)!.x).attr('y2', (d) => lookup.get(d.target)!.y);
  const nodeGroup = svg.append('g');
  const nodeSelection = nodeGroup.selectAll<SVGGElement, PositionedNode>('g').data(nodes).join('g')
    .attr('class', (d) => `network-node network-node--${d.type}`).attr('transform', (d) => `translate(${d.x},${d.y})`)
    .attr('role', 'button').attr('tabindex', 0).attr('aria-pressed', 'false')
    .on('focus', (_event, d) => choose(d.id))
    .on('click', (_event, d) => choose(d.id))
    .on('keydown', (event: KeyboardEvent, d) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(d.id); }
      if (event.key === 'Escape') { event.preventDefault(); choose(null); }
    });
  // Generous invisible targets make the small points usable by touch.
  nodeSelection.append('circle').attr('class', 'network-hit-target').attr('r', 32).attr('fill', 'transparent');
  nodeSelection.append('circle').attr('class', 'network-halo').attr('r', (d) => d.type === 'topic' ? 30 : 21).attr('pointer-events', 'none');
  nodeSelection.append('circle').attr('class', 'network-focus').attr('r', 31).attr('pointer-events', 'none');
  nodeSelection.filter((d) => d.type === 'person').append('circle').attr('class', 'network-shape').attr('r', 7.5).attr('pointer-events', 'none');
  nodeSelection.filter((d) => d.type === 'topic').append('path').attr('class', 'network-shape')
    .attr('d', 'M 0,-12 L 12,0 L 0,12 L -12,0 Z').attr('pointer-events', 'none');
  nodeSelection.append('title');
  const topicLabels = svg.append('g').attr('aria-hidden', 'true').selectAll('text').data(nodes.filter((d) => d.type === 'topic')).join('text')
    .attr('class', 'network-topic-label').attr('x', (d) => d.x).attr('y', (d) => d.y + 39).attr('text-anchor', 'middle');
  let layoutWidth = 0;
  let portrait = false;
  let labelSize = 15;

  function renderTopicLabels() {
    topicLabels.attr('x', (d) => d.x).attr('y', (d) => d.y + (portrait ? 31 : 39))
      .style('font-size', `${labelSize}px`)
      .each(function (node) {
        const text = select(this);
        text.selectAll('tspan').remove();
        text.text('');
        // Measure words in the real font. Wrap long topics on both layouts;
        // their text stays readable without extending past the graphic's edges.
        const viewWidth = portrait ? 480 : 860;
        const maxWidth = Math.min(portrait ? 184 : 240, node.x * 2 - 28, (viewWidth - node.x) * 2 - 28);
        let line = '';
        let span = text.append('tspan').attr('x', node.x).attr('dy', 0);
        for (const word of label(node).split(' ')) {
          const candidate = line ? `${line} ${word}` : word;
          span.text(candidate);
          if (line && (span.node()?.getComputedTextLength() ?? 0) > maxWidth) {
            span.text(line);
            line = word;
            span = text.append('tspan').attr('x', node.x).attr('dy', labelSize * 1.1).text(line);
          } else line = candidate;
        }
      });
  }

  function updateLayout(width: number) {
    if (width <= 0 || Math.abs(width - layoutWidth) < .5) return;
    layoutWidth = width;
    portrait = width < 480;
    const scale = width / (portrait ? 480 : 860);
    labelSize = Math.max(portrait ? 18 : 15, 12 / scale);
    svg.attr('viewBox', portrait ? '0 0 480 640' : '0 0 860 540');
    nodes.forEach(node => {
      const original = originalPositions.get(node.id)!;
      node.x = portrait ? 24 + original.x * 432 / 860 : original.x;
      node.y = portrait ? 16 + original.y * 604 / 540 : original.y;
    });
    edges.attr('x1', d => lookup.get(d.source)!.x).attr('y1', d => lookup.get(d.source)!.y)
      .attr('x2', d => lookup.get(d.target)!.x).attr('y2', d => lookup.get(d.target)!.y);
    nodeSelection.attr('transform', d => `translate(${d.x},${d.y})`);
    const hitRadius = portrait ? Math.max(21, 14 / scale) : 32;
    nodeSelection.select('.network-hit-target').attr('r', hitRadius);
    nodeSelection.select('.network-focus').attr('r', hitRadius - 1);
    nodeSelection.filter(d => d.type === 'person').select('.network-shape').attr('r', portrait ? Math.max(8, 5.5 / scale) : 7.5);
    const diamond = portrait ? Math.max(12, 8 / scale) : 12;
    nodeSelection.filter(d => d.type === 'topic').select('.network-shape')
      .attr('d', `M 0,-${diamond} L ${diamond},0 L 0,${diamond} L -${diamond},0 Z`);
    renderTopicLabels();
  }

  const controls = document.createElement('div');
  controls.className = 'network-controls';
  const status = document.createElement('p');
  status.className = 'network-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'network-reset';
  reset.addEventListener('click', () => choose(null));
  controls.append(status, reset);
  root.append(controls);

  // The text alternative explicitly identifies the fictional example data.
  const details = document.createElement('details');
  details.className = 'network-text';
  const summary = document.createElement('summary');
  const note = document.createElement('p');
  note.className = 'network-text-note';
  const list = document.createElement('ul');
  list.className = 'network-text-list';
  details.append(summary, note, list);
  root.append(details);
  const textNodes = nodes.filter((node) => node.type === 'topic').map((node) => {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'network-text-node';
    button.addEventListener('click', () => choose(node.id));
    button.addEventListener('focus', () => choose(node.id));
    const connections = document.createElement('span');
    connections.className = 'network-text-connections';
    li.append(button, connections);
    list.append(li);
    return { node, button, connections };
  });
  const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') choose(null); };
  root.addEventListener('keydown', escape);

  function describe(node: NetworkNode) {
    const connected = [...neighbors(node.id)].map((id) => lookup.get(id)!);
    if (node.type === 'topic') return connected.length ? `${connected.length} ${labels[lang].connections}` : labels[lang].none;
    const names = connected.map(label).join(', ');
    return names ? `${labels[lang].connected}: ${names}` : labels[lang].none;
  }

  function updateStatus() {
    const selected = selectedId ? lookup.get(selectedId) : null;
    status.textContent = selected ? `${label(selected)} · ${describe(selected)}` : labels[lang].idle;
    reset.disabled = !selected;
  }

  function choose(id: string | null) {
    selectedId = id;
    const connected = id ? neighbors(id) : new Set<string>();
    root.classList.toggle('has-selection', !!id);
    nodeSelection.attr('aria-pressed', (d) => String(d.id === id))
      .classed('is-selected', (d) => d.id === id)
      .classed('is-connected', (d) => connected.has(d.id));
    edges.classed('is-lit', (d) => !!id && (d.source === id || d.target === id));
    topicLabels.classed('is-dim', (d) => !!id && d.id !== id && !connected.has(d.id));
    textNodes.forEach(({ node, button }) => button.setAttribute('aria-pressed', String(node.id === id)));
    updateStatus();
  }

  function setLanguage(next: Language) {
    lang = next;
    svg.attr('aria-label', labels[lang].graph);
    nodeSelection.attr('aria-label', title).select('title').text(title);
    renderTopicLabels();
    reset.textContent = labels[lang].clear;
    summary.textContent = labels[lang].textView;
    note.textContent = labels[lang].textNote;
    textNodes.forEach(({ node, button, connections }) => {
      button.textContent = label(node);
      button.setAttribute('aria-label', title(node));
      connections.textContent = describe(node);
    });
    updateStatus();
  }

  setLanguage(lang);
  updateLayout(root.getBoundingClientRect().width);
  const resizeObserver = new ResizeObserver(entries => updateLayout(entries[0].contentRect.width));
  resizeObserver.observe(root);
  return {
    setLanguage,
    destroy() { resizeObserver.disconnect(); root.removeEventListener('keydown', escape); root.replaceChildren(); root.classList.remove('ab3c-network'); },
  };
}
