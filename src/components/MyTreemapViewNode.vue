<script lang="ts" setup>
import { computed } from "vue"

const props = defineProps<{
  node: any
  nodesById: Record<string, any>
  currentId: string
}>()

const nodeWithData = computed(() => props.nodesById[props.node.id])
const hasBodyHtml = computed(
  () => nodeWithData.value?.bodyHtml?.length > 0 && nodeWithData.value.bodyHtml !== "<p><br></p>",
)
</script>

<template>
  <div
    :style="{
      position: 'absolute',
      left: node.x + 'px',
      top: node.y + 'px',
      width: node.width + 'px',
      height: node.height + 'px',
      zIndex: currentId === node.id ? 10 : 1,
    }"
    class="bg-blue-500 text-white rounded px-2 text-center @container overflow-y-auto overflow-x-hidden hover:z-20 hover:bg-blue-400"
  >
    <div class="min-h-full w-full flex flex-col justify-center transition-all">
      <h1 class="text-[0.6rem] @2xs:text-sm @xs:text-base @sm:text-lg">{{ nodeWithData.title }}</h1>
      <p
        v-if="hasBodyHtml"
        v-html="nodeWithData.bodyHtml"
        class="text-left text-[0.5rem] @2xs:text-xs @xs:text-sm @sm:text-base"
      ></p>
    </div>
  </div>
</template>

<style lang="css" scoped>
.node-box {
  transition: all 0.3s ease;
  container-name: node-box;
}

.node-box:hover {
  z-index: 20;
  filter: brightness(110%);
}
</style>
