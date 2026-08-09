import { expect, test } from 'rstack/test';
import { mount } from '@vue/test-utils';
import App from '../src/App.vue';

test('renders the main page', () => {
  const wrapper = mount(App);
  expect(wrapper.element).toHaveTextContent('Rstack with Vue');
});
