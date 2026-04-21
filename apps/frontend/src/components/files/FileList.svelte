<script lang="ts">
  import FileItem from './FileItem.svelte';
  import type { DriveItem } from './types';

  let { items = [], onselect, oncontextmenu } = $props<{
    items: DriveItem[];
    onselect?: (item: DriveItem, e: MouseEvent | KeyboardEvent) => void;
    oncontextmenu?: (item: DriveItem, e: MouseEvent) => void;
  }>();
</script>

<div class="flex flex-col gap-1 w-full py-2" role="list">
  <div class="hidden md:flex items-center px-4 pl-12 py-2 text-xs font-semibold uppercase tracking-wider border-b mb-2" style="color: var(--color-text-secondary); border-color: var(--color-border-subtle);">
    <span class="flex-1">Nazwa</span>
    <span class="w-42.5 text-right">Szczegóły</span>
    <span class="w-8"></span>
  </div>

  {#each items as item (item.id)}
    <FileItem 
      {item} 
      viewMode="list" 
      onselect={(e) => onselect && onselect(item, e)}
      oncontextmenu={(e) => oncontextmenu && oncontextmenu(item, e)}
    />
  {/each}
</div>
