import React, { useEffect } from "react";
import * as d3 from "d3";
import axios from "axios";

function TreeVisualizer() {
  useEffect(() => {
    axios.get("http://127.0.0.1:5000/tree-data").then((response) => {
      const treeData = response.data;
      drawTree(treeData);
    });
  }, []);

  const drawTree = (data) => {
    const width = 400, height = 300;
    const svg = d3.select("#tree").attr("width", width).attr("height", height);
    svg.selectAll("*").remove();

    const root = d3.hierarchy(data);
    const treeLayout = d3.tree().size([width - 40, height - 40]);
    treeLayout(root);

    const g = svg.append("g").attr("transform", "translate(20,20)");

    g.selectAll("line")
      .data(root.links())
      .enter()
      .append("line")
      .attr("x1", (d) => d.source.x)
      .attr("y1", (d) => d.source.y)
      .attr("x2", (d) => d.target.x)
      .attr("y2", (d) => d.target.y)
      .attr("stroke", "black");

    g.selectAll("circle")
      .data(root.descendants())
      .enter()
      .append("circle")
      .attr("cx", (d) => d.x)
      .attr("cy", (d) => d.y)
      .attr("r", 5)
      .attr("fill", "blue");

    g.selectAll("text")
      .data(root.descendants())
      .enter()
      .append("text")
      .attr("x", (d) => d.x + 10)
      .attr("y", (d) => d.y + 5)
      .text((d) => d.data.name)
      .attr("font-size", "10px");
  };

  return <svg id="tree"></svg>;
}

export default TreeVisualizer;
