import './MenuOffBadge.css';

export function MenuOffBadge({available}:{available:boolean}) {
  return available ? null : <span className="menu-off-badge" aria-label="Unavailable">OFF</span>;
}
