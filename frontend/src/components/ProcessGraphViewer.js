import React, { useEffect, useState } from "react";
import * as d3 from "d3";

const ProcessGraphViewer = ({ processTrees, onReset, onSelectNodeResults, onSelectNodeForNextPrompt }) => {
  const [selectedResults, setSelectedResults] = useState([]);
  const [selectedPromptNodeId, setSelectedPromptNodeId] = useState(null);
  const [selectedPromptImages, setSelectedPromptImages] = useState([]);

  useEffect(() => {
    renderTrees();
  }, [processTrees]);

  const intersect = (a, b) => {
    const names = new Set(a.map(r => r.filename));
    return b.filter(r => names.has(r.filename));
  };

  const buildTree = (chain, treeIndex) => {
    if (!Array.isArray(chain) || chain.length === 0) return null;

    const initialNode = {
      id: `tree-${treeIndex}-initial`,
      label: "All Selected Images",
      results: chain[0]?.yesResults.concat(chain[0]?.noResults || []),
      children: [],
    };

    const prompt1 = {
      id: `tree-${treeIndex}-prompt-1`,
      label: "Prompt 1",
      results: chain[0]?.yesResults || [],
      children: [],
    };

    const noResults = chain[0]?.noResults || [];
    if (noResults.length > 0) {
      initialNode.children.push({
        id: `tree-${treeIndex}-no-1`,
        label: "No",
        results: noResults,
        children: [],
      });
    }

    initialNode.children.push(prompt1);

    const buildSteps = (parent, index, cumulative) => {
      if (index + 1 >= chain.length) return;
      const step = chain[index + 1];
      const match = intersect(cumulative, step.yesResults);

      if (match.length > 0) {
        const yesNode = {
          id: `tree-${treeIndex}-prompt-${index + 2}`,
          label: `Prompt ${index + 2}`,
          results: match,
          children: [],
        };
        parent.children.push(yesNode);
        buildSteps(yesNode, index + 1, match);
      } else {
        parent.children.push({
          id: `tree-${treeIndex}-no-${index + 2}`,
          label: "No",
          results: [],
          children: [],
        });
      }

      if (step.noResults?.length > 0) {
        parent.children.push({
          id: `tree-${treeIndex}-no-${index + 2}`,
          label: "No",
          results: step.noResults,
          children: [],
        });
      }
    };

    buildSteps(prompt1, 0, prompt1.results);
    return initialNode;
  };

  const drawTree = (data, treeIndex) => {
    const width = 500;
    const height = 700;
    const thumbnailSize = 16;
    const spacing = 2;
    const maxPerRow = 6;

    const svg = d3.select("#process-graph")
      .append("svg")
      .attr("width", width)
      .attr("height", height)
      .style("border", "1px solid #ccc")
      .style("marginBottom", "20px")
      .append("g")
      .attr("transform", "translate(40,80)");

    const root = d3.hierarchy(data);
    d3.tree().size([width - 70, height - 150])(root);

    svg.selectAll(".link")
      .data(root.links())
      .enter()
      .append("line")
      .attr("x1", d => d.source.x)
      .attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x)
      .attr("y2", d => d.target.y)
      .attr("stroke", d => d.target.data.label === "No" ? "red" : "green")
      .attr("stroke-width", 5)
      .style("cursor", "pointer")
      .on("click", (event, d) => {
        setSelectedResults(d.target.data.results || []);
        if (onSelectNodeResults) onSelectNodeResults(d.target.data.results || []);
      });

    const nodeGroup = svg.selectAll(".node")
      .data(root.descendants())
      .enter()
      .append("g")
      .attr("transform", d => `translate(${d.x - 50}, ${d.y - 60})`);

    nodeGroup.append("rect")
      .attr("width", 120)
      .attr("height", d => {
        const rows = Math.ceil((d.data.results.length || 1) / maxPerRow);
        return 20 + rows * (thumbnailSize + spacing) + 35;
      })
      .attr("fill", "#fff")
      .attr("stroke", "#000")
      .attr("rx", 10)
      .attr("ry", 10)
      .on("click", (event, d) => {
        setSelectedResults(d.data.results || []);
        if (onSelectNodeResults) onSelectNodeResults(d.data.results || []);
      });

    nodeGroup.each(function (d) {
      const g = d3.select(this);
      const images = d.data.results;

      images.forEach((img, idx) => {
        const col = idx % maxPerRow;
        const row = Math.floor(idx / maxPerRow);
        g.append("image")
          .attr("xlink:href", img.imageUrl)
          .attr("x", 8 + col * (thumbnailSize + spacing))
          .attr("y", 8 + row * (thumbnailSize + spacing))
          .attr("width", thumbnailSize)
          .attr("height", thumbnailSize);
      });
    });

    const baseY = d => {
      const rows = Math.ceil((d.data.results.length || 1) / maxPerRow);
      return 20 + rows * (thumbnailSize + spacing);
    };

    nodeGroup.append("text")
      .attr("x", 60)
      .attr("y", d => baseY(d) + 12)
      .attr("text-anchor", "middle")
      .style("font-size", "12px")
      .style("font-weight", "bold")
      .text(d => d.data.label);

    nodeGroup.append("text")
      .attr("x", 60)
      .attr("y", d => baseY(d) + 30)
      .attr("text-anchor", "middle")
      .attr("class", "select-for-prompt")
      .style("fill", d => selectedPromptNodeId === d.data.id ? "green" : "blue")
      .style("cursor", "pointer")
      .style("font-size", "12px")
      .text(d =>
        selectedPromptNodeId === d.data.id
          ? "✅ Selected for Prompt"
          : "➕ Select for Prompt"
      )
      .on("click", function (event, d) {
        event.stopPropagation();
        setSelectedPromptNodeId(d.data.id);
        setSelectedPromptImages(d.data.results || []);

      if (onSelectNodeForNextPrompt) {
        const treeIndex = parseInt(d.data.id.split("-")[1]);
        onSelectNodeForNextPrompt(d.data.results || [], d.data.id, treeIndex);
      }

        // Update all text labels
        d3.selectAll(".select-for-prompt")
          .text(n =>
            n.data.id === d.data.id
              ? "✅ Selected for Prompt"
              : "➕ Select for Prompt"
          )
          .style("fill", n =>
            n.data.id === d.data.id ? "green" : "blue"
          );
      });
  };

  const renderTrees = () => {
    d3.select("#process-graph").html("");

    const validTrees = processTrees
      .filter(tree => Array.isArray(tree) && tree.length > 0)
      .map((tree, index) => buildTree(tree, index))
      .filter(tree => tree !== null);

    validTrees.forEach((treeData, idx) => {
      drawTree(treeData, idx);
    });
  };

  useEffect(() => {
    renderTrees();
  }, []);

  return (
    <div>
      <h2>Process Graph Viewer</h2>
      <button onClick={onReset}>Reset</button>
      <div
  id="process-graph"
  style={{
    width: "100%",
    height: "700px",      // Limit height
    overflowY: "auto",     // Enable vertical scroll
    overflowX: "auto",     // Just in case it gets wider
    border: "1px solid #ccc",
    padding: "10px",
    boxSizing: "border-box"
  }}
></div>
      {selectedResults.length > 0 && (
        <div>
          <h3>Selected Results:</h3>
          <ul>
            {selectedResults.map((result, index) => (
              <li key={index}>{result.filename}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default ProcessGraphViewer;
