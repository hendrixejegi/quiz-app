import { useState } from 'react';
import { Link } from 'react-router';
import LibraryAccess, {
  LibraryHeading,
  ResourceState,
} from '../../components/library/LibraryAccess';
import { useLibraryResource } from '../../hooks/useLibraryResource';
import { useWorkspace, WorkspaceAccess } from '../../contexts/WorkspaceContext';

import { api } from '../../api';

import { orgPath } from './OrganisationUI';
export default function OrganisationAuditPage() {
  return (
    <LibraryAccess organisationAuthor={false}>
      <WorkspaceAccess managers>
        <AuditHistory />
      </WorkspaceAccess>
    </LibraryAccess>
  );
}
function AuditHistory() {
  const { organisation: org } = useWorkspace();
  const [offset, setOffset] = useState(0);
  const resource = useLibraryResource(
    `/api/organisations/${org.id}/audit?offset=${offset}&limit=20`,
  );
  return (
    <>
      <LibraryHeading
        title="Audit history"
        description={`${org.name} · Actions and identifiers, never invitation tokens or quiz content.`}
      >
        <Link className="secondary-button" to={orgPath(org.id)}>
          Organisation overview
        </Link>
      </LibraryHeading>
      <ResourceState resource={resource} />
      {resource.data && (
        <>
          <div className="library-list">
            {resource.data.items.map((record) => (
              <article className="audit-row" key={record.id}>
                <strong>{record.action}</strong>
                <span>
                  {record.outcome} ·{' '}
                  {new Date(record.created_at).toLocaleString()}
                </span>
                <p>
                  Actor: {record.actor_id}
                  <br />
                  Target: {record.target_id}
                  <br />
                  Reference: {record.correlation_id}
                </p>
              </article>
            ))}
          </div>
          <nav className="library-actions" aria-label="Audit pages">
            <button
              className="secondary-button"
              disabled={offset === 0}
              onClick={() => setOffset((n) => Math.max(0, n - 20))}
            >
              Previous
            </button>
            <span>
              {Math.min(offset + 20, resource.data.total)} of{' '}
              {resource.data.total}
            </span>
            <button
              className="secondary-button"
              disabled={offset + 20 >= resource.data.total}
              onClick={() => setOffset((n) => n + 20)}
            >
              Next
            </button>
          </nav>
        </>
      )}
    </>
  );
}
