<script lang="ts">
  import './button.css';

  type Size = 'small' | 'medium' | 'large';

  interface Props {
    primary?: boolean;
    backgroundColor?: string;
    size?: Size;
    label?: string;
    onClick?: () => void;
  }

  let {
    primary = false,
    backgroundColor,
    size = 'medium',
    label = 'Demo Button',
    onClick,
  }: Props = $props();

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
