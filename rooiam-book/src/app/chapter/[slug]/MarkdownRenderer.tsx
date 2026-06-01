"use client";

import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeHighlight from 'rehype-highlight';
import mermaid from 'mermaid';

function buildSchemaHtmlLabel(rawLabel: string) {
  // Normalize line breaks and split
  const parts = rawLabel.split(/<br\s*\/?>/i).map(part => part.trim()).filter(Boolean);
  if (parts.length < 1) return rawLabel;

  const title = parts[0];
  const rows = parts.slice(1);
  const longestRowLength = Math.max(
    title.length,
    ...rows.map(row => row.replace(/<[^>]+>/g, '').length),
  );
  const estimatedWidth = Math.min(720, Math.max(360, longestRowLength * 11 + 120));
  const rowHtml = rows.map(row => {
    // 1. Check for PK: or FK: labels (Metadata)
    const match = row.match(/^(PK:|FK:)\s*(.+)$/i);
    if (match) {
      return `<div class='db-row db-row-meta'><span>${match[1].toUpperCase()}</span><span>${match[2].replace(/"/g, '&quot;')}</span></div>`;
    }

    // 2. Check for key: value pairs
    const kv = row.match(/^([^:]+):\s*(.+)$/);
    if (kv) {
      return `<div class='db-row'><span>${kv[1].replace(/"/g, '&quot;')}:</span><span>${kv[2].replace(/"/g, '&quot;')}</span></div>`;
    }

    // 3. Simple row (Single column style)
    return `<div class='db-row db-row-single'><span>${row.replace(/"/g, '&quot;')}</span><span></span></div>`;
  }).join('');

  return `<div class='db-table' style='min-width:${estimatedWidth}px;width:${estimatedWidth}px;'><div class='db-table-header'>${title.replace(/"/g, '&quot;')}</div><div class='db-table-body'>${rowHtml}</div></div>`;
}

function preprocessMermaid(chart: string) {
  // Only preprocess if it's a table-diagram
  if (!chart.includes('classDef table')) {
    return chart;
  }

  return chart
    .replace(
      /^(\s*[A-Za-z0-9_\-.]+)\["([\s\S]*?)"\](\s*)$/gm,
      (_full, nodeId: string, label: string, suffix: string) =>
        `${nodeId}("${buildSchemaHtmlLabel(label)}")${suffix}`,
    )
    .replace(
      /^(\s*[A-Za-z0-9_\-.]+)\[(.+?)\](\s*)$/gm,
      (_full, nodeId: string, label: string, suffix: string) =>
        `${nodeId}("${buildSchemaHtmlLabel(label)}")${suffix}`,
    )
    .replace(
      /\\n/g, '<br/>',
    );
}

function Mermaid({ chart }: { chart: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [isZoomed, setIsZoomed] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    setRenderError(null);
    const normalizedChart = preprocessMermaid(chart);
    
    mermaid.initialize({
      startOnLoad: false,
      theme: 'base',
      logLevel: 'error',
      securityLevel: 'loose',
      themeVariables: {
        primaryColor: '#ffffff',
        primaryTextColor: '#111827',
        primaryBorderColor: '#3b82f6',
        lineColor: '#94a3b8',
        secondaryColor: '#ffffff',
        tertiaryColor: '#ffffff',
        mainBkg: '#ffffff',
        nodeBorder: '#3b82f6',
        clusterBkg: 'rgba(255, 255, 255, 0.05)',
        clusterBorder: '#475569',
        fontSize: '16px',
        fontFamily: 'Outfit, Inter, system-ui, sans-serif',
        // Sequence Diagram Variables
        actorBkg: '#ffffff',
        actorBorder: '#3b82f6',
        actorTextColor: '#111827',
        noteBkgColor: '#fef3c7',
        noteTextColor: '#111827',
        activationBkgColor: '#3b82f6',
      },
      flowchart: {
        htmlLabels: true,
        curve: 'linear',
        padding: 24,
        useMaxWidth: true
      },
      sequence: {
        useMaxWidth: true,
        showSequenceNumbers: false,
        actorMargin: 80,
        boxMargin: 15,
        boxTextMargin: 8,
        noteMargin: 15,
        messageMargin: 40,
        mirrorActors: true,
      },
      themeCSS: `
        .mermaid-diagram svg {
          background-color: #111827 !important;
          border: 1px solid #334155 !important;
          border-radius: 16px !important;
          padding: 24px !important;
          max-width: 100% !important;
          height: auto !important;
          box-sizing: border-box !important;
        }

        /* Node labels and containers */
        .nodeLabel, .label-container, .actor-name, .actor text, .node text, .node tspan, .label text { 
          color: #111827 !important;
          fill: #111827 !important;
          font-weight: 600 !important;
          font-size: 16px !important;
        }

        /* Subgraph titles sit on the dark canvas, so they need light text */
        .cluster-label text, .cluster-label span, .cluster text, .cluster span {
          fill: #f8fafc !important;
          color: #f8fafc !important;
          font-weight: 700 !important;
        }

        /* Standardize all node shapes */
        .node rect, .node circle, .node polygon, .node path, .node ellipse,
        rect.node, circle.node, polygon.node, path.node, ellipse.node {
          fill: #ffffff !important;
          stroke: #3b82f6 !important;
          stroke-width: 2px !important;
        }
        
        .node rect, rect.node {
          rx: 10px !important;
          ry: 10px !important;
        }

        /* Schema entities use the custom inner table card, not a second outer Mermaid border */
        .node.table rect, .node.table circle, .node.table polygon, .node.table path {
          fill: transparent !important;
          stroke: none !important;
        }

        /* The lines connecting nodes */
        .edgePath .path, .line, .actor-line, .messageLine0, .messageLine1,
        .flowchart-link {
          stroke: #94a3b8 !important;
          stroke-width: 2.5px !important;
        }

        /* Arrowheads should match lines */
        .markerPath, .arrowheadPath, .arrowhead, marker path, marker polygon,
        #mermaid-svg-marker-start path, #mermaid-svg-marker-end path {
          fill: #94a3b8 !important;
          stroke: #94a3b8 !important;
        }

        /* Line labels and sequence text */
        .messageText, .loopText, .edgeLabel, .edgeLabel span, .edgeLabel text {
          fill: #f1f5f9 !important;
          color: #f1f5f9 !important;
          font-weight: 500 !important;
        }
        .edgeLabel rect, .labelBkg {
          fill: transparent !important;
          stroke: none !important;
          opacity: 1 !important;
        }
        .edgeLabel foreignObject {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
        }
        .edgeLabel div {
          background: #0f172a !important;
          color: #f8fafc !important;
          fill: #f8fafc !important;
          border: none !important;
          border-radius: 6px !important;
          box-shadow: 0 0 0 1px rgba(148, 163, 184, 0.35) !important;
        }
        .edgeLabel div {
          display: inline-block !important;
          padding: 2px 6px !important;
          line-height: 1.2 !important;
          box-sizing: border-box !important;
        }
        .edgeLabel span {
          background: transparent !important;
          color: #f8fafc !important;
          fill: #f8fafc !important;
          border: none !important;
          box-shadow: none !important;
          padding: 0 !important;
        }

        /* Sequence Diagram specific overrides */
        .actor rect {
          fill: #ffffff !important;
        }
        .note rect {
          fill: #fef3c7 !important;
          stroke: #f59e0b !important;
        }
        .noteText, .noteText tspan {
          fill: #111827 !important;
        }

        /* Database Tables: White cards with blue headers and rounded corners */
        .db-table {
          background: #ffffff !important;
          border: 2px solid #3b82f6 !important;
          border-radius: 12px !important;
          overflow: hidden;
          width: max-content;
          min-width: 360px;
          max-width: none !important;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.15);
          color: #111827 !important;
        }
        .db-table-header {
          background: #3b82f6 !important;
          color: #ffffff !important;
          padding: 12px 16px;
          font-weight: 800;
          font-size: 1.1rem;
          text-align: center;
          border-bottom: 2px solid #2563eb;
        }
        .db-table-body {
          padding: 14px 18px;
          font-family: 'Fira Code', monospace;
          background: #ffffff !important;
          color: #1e293b !important;
          text-align: left !important;
        }
        
        .db-row {
          display: grid !important;
          grid-template-columns: minmax(120px, max-content) minmax(180px, 1fr) !important;
          gap: 16px;
          margin: 8px 0;
          align-items: baseline;
        }
        .db-row span {
          display: block !important;
          font-size: 0.95rem;
        }
        .db-row span:first-child {
          font-weight: 700;
          color: #64748b;
          text-align: left;
          white-space: nowrap;
        }
        .db-row span:last-child {
          text-align: left;
          color: #0f172a;
          word-break: normal;
          overflow-wrap: anywhere;
        }
        .db-row-meta span:first-child {
          color: #2563eb;
        }
        .db-row-single {
          grid-template-columns: minmax(0, 1fr) 0 !important;
        }
        .db-row-single span:first-child {
          color: #0f172a;
          font-weight: 600;
        }

        /* Hide version string */
        .version, text[id*="version"], .mermaid-version {
          display: none !important;
        }
      `,
    });

    if (ref.current) {
      ref.current.id = 'mermaid-' + Math.random().toString(36).substr(2, 9);
      mermaid.render(ref.current.id + '-svg', normalizedChart).then((res: any) => {
        if (ref.current) {
          ref.current.innerHTML = res.svg;
        }
      }).catch((e: any) => {
        console.error('Mermaid rendering failed', e);
        setRenderError(e instanceof Error ? e.message : 'Mermaid rendering failed.');
      });
    }
  }, [chart]);

  if (renderError) {
    return (
      <div className="diagram-error" style={{
        margin: '2rem 0',
        padding: '2rem',
        borderRadius: '12px',
        backgroundColor: '#fef2f2',
        border: '1px solid #fee2e2',
        color: '#991b1b'
      }}>
        <p style={{ fontWeight: 800, marginBottom: '0.5rem' }}>Mermaid Syntax Error</p>
        <div style={{ 
          fontFamily: 'monospace', 
          fontSize: '0.85rem', 
          backgroundColor: '#fff', 
          padding: '1rem', 
          borderRadius: '8px',
          border: '1px solid #fca5a5',
          overflowX: 'auto',
          marginBottom: '1rem'
        }}>
          {renderError}
        </div>
        <p style={{ fontSize: '0.85rem', color: '#7f1d1d', marginBottom: '0.5rem' }}>Source Diagram:</p>
        <pre style={{ 
          fontSize: '0.8rem', 
          backgroundColor: '#1e293b', 
          color: '#f8fafc', 
          padding: '1rem', 
          borderRadius: '8px',
          overflowX: 'auto'
        }}>{chart}</pre>
      </div>
    );
  }

  return (
    <>
      <div 
        ref={ref} 
        onClick={() => setIsZoomed(true)}
        className="mermaid-diagram" 
        style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          margin: '2.5rem auto',
          width: '100%',
          maxWidth: '1000px',
          overflowX: 'auto',
          background: 'transparent',
          padding: 0,
          borderRadius: 0,
          boxShadow: 'none',
          cursor: 'zoom-in',
          transition: 'transform 0.2s ease-in-out',
        }} 
      />
      {isZoomed && (
        <div 
          onClick={() => setIsZoomed(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            cursor: 'zoom-out',
            backdropFilter: 'blur(8px)'
          }}
        >
          <div 
            className="mermaid-diagram-zoom"
            style={{ 
              maxWidth: '95vw', 
              maxHeight: '95vh', 
              overflow: 'auto',
              backgroundColor: 'transparent',
              borderRadius: '24px',
              padding: '0',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              border: 'none'
            }}
            dangerouslySetInnerHTML={{ __html: ref.current?.innerHTML || '' }}
          />
          <div style={{
            position: 'absolute',
            top: '2rem',
            right: '2rem',
            color: 'white',
            fontSize: '1.5rem',
            fontWeight: '300',
            cursor: 'pointer'
          }}>✕ Close</div>
        </div>
      )}
    </>
  );
}

export default function MarkdownRenderer({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw, rehypeHighlight]}
      components={{
        code(props) {
          const { children, className, node, ...rest } = props;
          const match = /language-(\w+)/.exec(className || '');
          if (match && match[1] === 'mermaid') {
            return <Mermaid chart={String(children).replace(/\n$/, '')} />;
          }
          return <code {...rest} className={className}>{children}</code>;
        }
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
