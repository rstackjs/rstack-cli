<script>
  import './button.css';

  let {
    primary = false,
    backgroundColor,
    size = 'medium',
    label = 'Demo Button',
    onClick,
  } = $props();

  const mode = $derived(
    primary ? 'demo-button--primary' : 'demo-button--secondary',
  );
</script>

<button
  type="button"
  class={['demo-button', `demo-button--${size}`, mode].join(' ')}
  style:background-color={backgroundColor}
  onclick={onClick}
>
  {label}
</button>
