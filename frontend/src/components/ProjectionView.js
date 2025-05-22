// ProjectionView.js
import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import axios from 'axios';
import './ProjectionView.css';

const ProjectionView = ({ data: projectionData, onReset, binaryYesFilenames = [] }) => {
  const containerRef = useRef();
  const svgOverlayRef = useRef();
  const [data, setData] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [xScale, setXScale] = useState(null);
  const [yScale, setYScale] = useState(null);
  const [zoomExtent, setZoomExtent] = useState(null);

  useEffect(() => {
    if (!projectionData) {
      axios.get('http://localhost:5000/projection-data').then(res => {
        const loaded = res.data.map(d => ({
          ...d,
          img: `http://localhost:5000${d.img}`,
          caption: '',
          similarity: 0
        }));
        setData(loaded);
        setFiltered(loaded);
      });
    }
  }, [projectionData]);

  useEffect(() => {
    if (
      projectionData &&
      projectionData.matching_images &&
      projectionData.reduced_embeddings &&
      projectionData.object_captions &&
      projectionData.matching_images.length === projectionData.reduced_embeddings.length
    ) {
      const formatted = projectionData.matching_images.map((imgPath, index) => {
        const filename = imgPath.split('\\').pop().split('/').pop();
        const description = projectionData.object_captions[index];
        return {
          img: `http://localhost:5000/images/${filename}`,
          x: projectionData.reduced_embeddings[index][0],
          y: projectionData.reduced_embeddings[index][1],
          caption: description,
          cluster: projectionData.cluster_labels?.[index] ?? 0,
          similarity: projectionData.similarities?.[index] ?? 0,
          filename
        };
      });

      const yesOnly = binaryYesFilenames.length > 0
        ? formatted.filter(item => binaryYesFilenames.includes(item.filename))
        : formatted;

      setData(yesOnly);
      setFiltered(yesOnly);
    }
  }, [projectionData, binaryYesFilenames]);

  useEffect(() => {
    if (filtered.length === 0) return;

    const width = 1000;
    const height = 800;

    const xExtent = d3.extent(filtered, d => d.x);
    const yExtent = d3.extent(filtered, d => d.y);
    const xScale = d3.scaleLinear().domain(xExtent).range([50, width - 50]);
    const yScale = d3.scaleLinear().domain(yExtent).range([50, height - 50]);
    setXScale(() => xScale);
    setYScale(() => yScale);

    const container = d3.select(containerRef.current);
    container.selectAll('img').remove();

    container.selectAll('img')
      .data(filtered)
      .enter()
      .append('img')
      .attr('src', d => d.img)
      .attr('class', 'image-node')
      .attr('width', 40)
      .style('position', 'absolute')
      .style('left', d => `${xScale(d.x)}px`)
      .style('top', d => `${yScale(d.y)}px`)
      .style('z-index', 1)
      .attr('title', d => `${d.caption || ''} ${d.similarity ? `(score: ${d.similarity.toFixed(2)})` : ''}`);

    const svg = d3.select(svgOverlayRef.current);
    svg.selectAll('*').remove();

    let start = null;
    let box = null;

    svg.on('mousedown', (event) => {
      start = d3.pointer(event);
      box = svg.append('rect')
        .attr('x', start[0])
        .attr('y', start[1])
        .attr('width', 0)
        .attr('height', 0)
        .attr('fill', 'rgba(0, 0, 255, 0.2)')
        .attr('stroke', 'blue')
        .attr('stroke-width', 1);
    });

    svg.on('mousemove', (event) => {
      if (!start || !box) return;
      const [x, y] = d3.pointer(event);
      box.attr('x', Math.min(start[0], x))
        .attr('y', Math.min(start[1], y))
        .attr('width', Math.abs(x - start[0]))
        .attr('height', Math.abs(y - start[1]));
    });

    svg.on('mouseup', (event) => {
      if (!start || !box) return;
      const [x, y] = d3.pointer(event);
      const x0 = Math.min(start[0], x);
      const x1 = Math.max(start[0], x);
      const y0 = Math.min(start[1], y);
      const y1 = Math.max(start[1], y);

      const zoomed = data.filter(d => {
        const xScaled = xScale(d.x);
        const yScaled = yScale(d.y);
        return xScaled >= x0 && xScaled <= x1 && yScaled >= y0 && yScaled <= y1;
      });

      setFiltered(zoomed);
      setZoomExtent({ x0, x1, y0, y1 });

      box.remove();
      start = null;
    });
  }, [filtered]);

  return (
    <div className="projection-wrapper">
      <h2>🧠 Visual Projection View</h2>
      <div className="projection-controls">
        {zoomExtent && (
          <button onClick={() => {
            setFiltered(data);
            setZoomExtent(null);
          }}>Reset Zoom</button>
        )}
        <button onClick={() => {
          setFiltered([]);
          setData([]);
          setZoomExtent(null);
          onReset && onReset();
        }}>Reset Results</button>
      </div>
      <div className="projection-container">
        <div ref={containerRef} className="image-layer" />
        <svg ref={svgOverlayRef} className="overlay-svg" />
      </div>
    </div>
  );
};

export default ProjectionView;
