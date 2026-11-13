import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../components/ui';

export default function NotFound() {
  useEffect(() => {
    document.title = 'Page not found · Plumb';
  }, []);
  return (
    <div className="wrap section">
      <EmptyState
        title="That page was not found"
        action={
          <div className="row">
            <Link className="btn primary" to="/">Back to the home page</Link>
            <Link className="btn" to="/studio">Open the Studio</Link>
          </div>
        }
      >
        The address may be mistyped or the page may have moved.
      </EmptyState>
    </div>
  );
}
