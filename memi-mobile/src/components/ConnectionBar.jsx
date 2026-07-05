import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { colors, fontSize, spacing } from '../theme'

export default function ConnectionBar({ status, serverUrl, onSettings }) {
  const dotColor =
    status === 'connected' ? colors.success :
    status === 'discovering' ? '#f59e0b' :
    colors.danger

  const label =
    status === 'connected' ? `已连接 ${serverUrl?.replace(/https?:\/\//, '').slice(0, 30)}` :
    status === 'discovering' ? '正在连接服务器...' :
    '未连接 — 点击设置服务器'

  return (
    <TouchableOpacity style={styles.bar} onPress={onSettings} activeOpacity={0.7}>
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      <Text style={[styles.label, status === 'discovering' && { color: '#f59e0b' }]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    flex: 1,
  },
})
