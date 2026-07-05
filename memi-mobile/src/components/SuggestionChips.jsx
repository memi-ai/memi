import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { colors, borderRadius, fontSize, spacing } from '../theme'

const SUGGESTIONS = [
  '写一首诗',
  '帮我写个Python脚本',
  '打开计算器',
  '截个屏',
  '帮我整理桌面文件',
  '今天天气怎么样',
]

export default function SuggestionChips({ onSelect }) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>试试这些</Text>
      <View style={styles.chips}>
        {SUGGESTIONS.map((text, i) => (
          <TouchableOpacity
            key={i}
            style={styles.chip}
            onPress={() => onSelect(text)}
            activeOpacity={0.7}
          >
            <Text style={styles.chipText}>{text}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  label: {
    fontSize: fontSize.caption,
    color: colors.textTertiary,
    marginBottom: spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.full,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  chipText: {
    fontSize: fontSize.body,
    color: colors.text,
  },
})
