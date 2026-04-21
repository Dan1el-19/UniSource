<script lang="ts">
  import FileItem from './FileItem.svelte';
  import type { DriveItem } from './types';

  let { items = [], onselect, oncontextmenu } = $props<{
    items: DriveItem[];
    onselect?: (item: DriveItem, e: MouseEvent | KeyboardEvent) => void;
    oncontextmenu?: (item: DriveItem, e: MouseEvent) => void;
  }>();
</script>

<div class="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(170px,1fr))] xl:grid-cols-[repeat(auto-fill,minmax(190px,1fr))] 2xl:grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3 md:gap-5 py-2" role="grid">
  {#each items as item (item.id)}
    <FileItem 
      {item} 
      viewMode="grid" 
      onselect={(e) => onselect && onselect(item, e)}
      oncontextmenu={(e) => oncontextmenu && oncontextmenu(item, e)}
    />
  {/each}
</div>
