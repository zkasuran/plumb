import { Link } from 'react-router-dom';
import { NAV } from './Header';
import { Logo } from './icons';

export function Footer() {
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="cols">
          <div className="stack">
            <Link to="/" className="brand">
              <Logo /> Plumb
            </Link>
            <p className="muted small">Design rules held by a real browser, inside your agent's loop. Built for the Kane CLI Online Hackathon by TestMu AI.</p>
          </div>
          {NAV.slice(0, 4).map((cat) => (
            <div key={cat.label}>
              <h4>{cat.label}</h4>
              <ul>
                {cat.items.map((it) => (
                  <li key={it.to}>
                    <Link to={it.to}>{it.title}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="legal">
          Apache-2.0. Plumb runs your rules with <a href="https://www.testmuai.com/kane-cli/">Kane CLI</a>. <Link to="/reports/limits">What Plumb does not prove</Link>.
        </p>
      </div>
    </footer>
  );
}
