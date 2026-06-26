import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Text } from "react-native";
import ChatScreen from "./screens/ChatScreen";

const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: "#111827",
          tabBarInactiveTintColor: "#9ca3af",
          tabBarStyle: { backgroundColor: "#fff", borderTopColor: "#e5e7eb" },
        }}
      >
        <Tab.Screen
          name="Chat"
          component={ChatScreen}
          options={{
            tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>💬</Text>,
            tabBarLabel: "聊天",
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
