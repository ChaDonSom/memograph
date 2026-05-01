import { onMounted, onUnmounted, Ref, ref } from "vue"

export default function useElementSize(elementRef?: Ref<HTMLElement | null>) {
  const element = elementRef || ref<HTMLElement | null>(null)
  const width = ref(0)
  const height = ref(0)

  const updateSize = () => {
    if (element.value) {
      width.value = element.value.offsetWidth
      height.value = element.value.offsetHeight
    }
  }

  onMounted(() => {
    updateSize()
    window.addEventListener("resize", updateSize, { passive: true })
    element.value?.addEventListener("resize", updateSize, { passive: true })
  })

  onUnmounted(() => {
    window.removeEventListener("resize", updateSize)
  })

  return { element, width, height }
}
