import { useEffect } from 'react';
import { useUser } from '../contexts/UserContext';

/**
 * Hook que convierte un color hexadecimal a RGB
 */
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : { r: 2, g: 132, b: 199 }; // Fallback a primary-600
}

/**
 * Hook que oscurece o aclara un color RGB
 */
function adjustBrightness(rgb, factor) {
  return {
    r: Math.max(0, Math.min(255, Math.round(rgb.r * factor))),
    g: Math.max(0, Math.min(255, Math.round(rgb.g * factor))),
    b: Math.max(0, Math.min(255, Math.round(rgb.b * factor))),
  };
}

/**
 * Mezcla un color RGB con blanco o negro para crear variaciones más suaves
 */
function mixWithWhite(rgb, amount) {
  const white = { r: 255, g: 255, b: 255 };
  return {
    r: Math.round(rgb.r * (1 - amount) + white.r * amount),
    g: Math.round(rgb.g * (1 - amount) + white.g * amount),
    b: Math.round(rgb.b * (1 - amount) + white.b * amount),
  };
}

function mixWithBlack(rgb, amount) {
  const black = { r: 0, g: 0, b: 0 };
  return {
    r: Math.round(rgb.r * (1 - amount) + black.r * amount),
    g: Math.round(rgb.g * (1 - amount) + black.g * amount),
    b: Math.round(rgb.b * (1 - amount) + black.b * amount),
  };
}

/**
 * Convierte RGB a hexadecimal
 */
function rgbToHex(rgb) {
  return `#${[rgb.r, rgb.g, rgb.b].map((x) => {
    const hex = x.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('')}`;
}

/**
 * Hook que aplica el color del usuario como variables CSS
 */
export function useUserColor() {
  const { currentUser } = useUser();
  const userColor = currentUser?.color || '#0284c7'; // Fallback a primary-600

  useEffect(() => {
    const root = document.documentElement;
    const rgb = hexToRgb(userColor);

    // Generar variaciones del color usando mezcla con blanco/negro para mejor contraste
    const color50 = mixWithWhite(rgb, 0.95);
    const color100 = mixWithWhite(rgb, 0.9);
    const color200 = mixWithWhite(rgb, 0.75);
    const color300 = mixWithWhite(rgb, 0.5);
    const color400 = mixWithWhite(rgb, 0.25);
    const color500 = rgb; // Color base ligeramente más claro
    const color600 = mixWithBlack(rgb, 0.1); // Color principal
    const color700 = mixWithBlack(rgb, 0.2);
    const color800 = mixWithBlack(rgb, 0.35);
    const color900 = mixWithBlack(rgb, 0.5);

    // Aplicar variables CSS
    root.style.setProperty('--user-color-50', rgbToHex(color50));
    root.style.setProperty('--user-color-100', rgbToHex(color100));
    root.style.setProperty('--user-color-200', rgbToHex(color200));
    root.style.setProperty('--user-color-300', rgbToHex(color300));
    root.style.setProperty('--user-color-400', rgbToHex(color400));
    root.style.setProperty('--user-color-500', rgbToHex(color500));
    root.style.setProperty('--user-color-600', rgbToHex(color600));
    root.style.setProperty('--user-color-700', rgbToHex(color700));
    root.style.setProperty('--user-color-800', rgbToHex(color800));
    root.style.setProperty('--user-color-900', rgbToHex(color900));
    root.style.setProperty('--user-color', userColor);
    
    // También guardar RGB para uso en rgba()
    root.style.setProperty('--user-color-600-rgb', `${color600.r}, ${color600.g}, ${color600.b}`);
  }, [userColor]);

  return userColor;
}
