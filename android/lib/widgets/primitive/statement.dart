import 'package:flutter/material.dart';

class Statement extends StatelessWidget {
  const Statement({super.key, required this.topic, required this.content});
  final String topic;
  final String content;
  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 20.0),
      titleTextStyle: Theme.of(context).textTheme.bodyLarge,
      title: Text(content),
      subtitle: Text(topic),
    );
  }
}
