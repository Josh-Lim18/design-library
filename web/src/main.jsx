import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import App from './App.jsx';
import Gallery from './pages/Gallery.jsx';
import ItemDetail from './pages/ItemDetail.jsx';
import './styles/app.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<App />}>
          <Route index element={<Gallery />} />
          <Route path="item/:id" element={<ItemDetail />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
