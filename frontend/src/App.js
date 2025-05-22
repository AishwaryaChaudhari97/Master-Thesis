import React from "react";
import { BrowserRouter as Router, Route, Routes, useNavigate, useLocation } from "react-router-dom"; // useLocation hook
import BinaryMode from "./components/BinaryMode";
import NonBinaryMode from "./components/NonBinaryMode";
import ProjectionView from './components/ProjectionView';
import "./App.css";

const ModeSelector = () => {
  const navigate = useNavigate(); // Initialize useNavigate hook
  const location = useLocation(); // Get current location (path)

  // Handle change in dropdown selection
  const handleModeChange = (e) => {
    const selectedMode = e.target.value;
    navigate(selectedMode); // Navigate to the selected route
  };

  // Get the current selected mode from the URL path
  const currentMode = location.pathname;

  return (
    <div className="mode-selector">
      <label>Select Mode:</label>
      <select onChange={handleModeChange} value={currentMode}>
        <option value="/binary">Binary Mode</option>
        <option value="/non-binary">Non-Binary Mode</option>
        <option value="/projectionview">ProjectionView</option>
      </select>
    </div>
  );
};

const App = () => {
  return (
    <Router>
      <div className="app">
        <Routes>
          {/* Route for Binary Mode */}
          <Route
            path="/binary"
            element={<BinaryMode mode="binary"><ModeSelector /></BinaryMode>}
          />
          {/* Route for Non-Binary Mode */}
          <Route
            path="/non-binary"
            element={<NonBinaryMode children={<ModeSelector />} />}
          />
           <Route
            path="/projectionview"
            element={<BinaryMode mode="projectionview"><ModeSelector /></BinaryMode>}
          />
          {/* Default Route to Binary Mode */}
          <Route
            path="/"
            element={<BinaryMode children={<ModeSelector />} />}
          />
        </Routes>
      </div>
    </Router>
  );
};

export default App;
