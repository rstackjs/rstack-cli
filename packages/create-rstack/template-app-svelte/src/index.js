import { mount } from 'svelte';
import App from './App.svelte';
import './index.css';

const root = document.getElementById('root');
if (root) {
  mount(App, { target: root });
}
