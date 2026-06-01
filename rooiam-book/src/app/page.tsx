import Link from 'next/link';
import { CHAPTERS } from './chapters';

export default function Home() {
  const chapterList = CHAPTERS.filter(c => c.slug !== '');

  return (
    <>
      {/* Cover block */}
      <div className="preface-cover">
        <h1>Operating Systems<br />for Identity</h1>
        <p className="cover-subtitle">
          Design and Implementation of the Rooiam Server
        </p>
        <p className="cover-meta">By the Rooiam Authors · First Edition</p>
        <Link href="/chapter/chapter-01-the-identity-core" className="begin-btn">
          Begin Reading →
        </Link>
      </div>

      {/* Preface */}
      <h2>Preface</h2>
      <p>
        Building an Identity and Access Management (IAM) server from scratch is comparable to
        writing a kernel for a small operating system. Where an OS kernel manages <strong>memory,
        processes, and hardware access</strong>, an Identity Server manages <strong>principals,
        sessions, and authorization graphs</strong>.
      </p>
      <p>
        Most contemporary web applications delegate login to third-party services such as Auth0,
        Clerk, or Cognito. These services are excellent for prototypes. But as a product matures
        into a platform — as it accumulates multi-tenant workspaces, custom auth policies, OIDC
        federation, fine-grained RBAC, and audit obligations — the rigid constraints of an
        external IAM begin to suffocate product development.
      </p>
      <p>
        This book follows the construction of <strong>Rooiam</strong>, a fully custom, open-source
        IAM platform written in <strong>Rust</strong> (Actix-web), backed by <strong>PostgreSQL</strong>
        and <strong>Redis</strong>. Each chapter dissects one core problem of identity — from the
        most fundamental question of <em>what is a user?</em> all the way through OIDC federation,
        hardware-bound passkeys, cryptographic audit trails, and enterprise network policy.
      </p>

      <h3>Who This Book Is For</h3>
      <p>
        This book is written for <strong>software engineers</strong> at any level who want to
        understand identity systems from first principles. You do not need prior security
        experience. Each chapter builds on the previous one, introduces the theoretical
        problem before any code, and always shows you the actual Rust source that Rooiam runs
        in production.
      </p>

      <h3>How Each Chapter Works</h3>
      <p>Every chapter follows the same four-part structure:</p>
      <ol>
        <li>
          <strong>The Problem</strong> — a clear, intuitive statement of the failure mode or
          attack that motivates the design.
        </li>
        <li>
          <strong>Theory</strong> — the computer-science or cryptographic concept that solves
          the problem, explained from scratch.
        </li>
        <li>
          <strong>Database Design</strong> — the PostgreSQL schema that encodes the solution
          durably and correctly.
        </li>
        <li>
          <strong>Rust Implementation</strong> — the actual <code>rooiam-server</code> code
          that executes the solution on every request.
        </li>
      </ol>
      <p>
        Each chapter closes with a <strong>Chapter Summary</strong> and a short set of
        <strong>Exercises</strong> to solidify understanding.
      </p>

      <h3>The Stack at a Glance</h3>
      <table>
        <thead>
          <tr><th>Layer</th><th>Technology</th><th>Role</th></tr>
        </thead>
        <tbody>
          <tr><td>Language</td><td>Rust</td><td>Memory-safe, zero-cost, compiled server</td></tr>
          <tr><td>Framework</td><td>Actix-web 4</td><td>Async HTTP, middleware, extractors</td></tr>
          <tr><td>Database</td><td>PostgreSQL 16</td><td>ACID transactions, JSONB, UUID primary keys</td></tr>
          <tr><td>Cache</td><td>Redis</td><td>Session rate-limit counters, OAuth state tokens</td></tr>
          <tr><td>ORM</td><td>sqlx</td><td>Compile-time checked SQL, async queries</td></tr>
          <tr><td>Auth</td><td>OIDC / RFC 6749</td><td>Standard protocol for app federation</td></tr>
        </tbody>
      </table>

      {/* Chapter list */}
      <h2 style={{ marginTop: '3rem' }}>Table of Contents</h2>
      <ol style={{ paddingLeft: '1.5rem' }}>
        {chapterList.map(ch => (
          <li key={ch.slug} style={{ marginBottom: '0.6rem' }}>
            <Link href={`/chapter/${ch.slug}`} style={{ fontFamily: 'Inter, sans-serif', fontWeight: 500 }}>
              Chapter {ch.num}: {ch.title}
            </Link>
          </li>
        ))}
      </ol>

      <div style={{ marginTop: '3rem' }}>
        <Link href="/chapter/chapter-01-the-identity-core" className="begin-btn">
          Start with Chapter 1 →
        </Link>
      </div>
    </>
  );
}
