import 'package:flutter/material.dart';

class MessageEditor extends StatefulWidget {
  const MessageEditor({super.key, required this.value, required this.onChange});
  final String value;
  final Function(String value) onChange;

  @override
  State<MessageEditor> createState() => _MessageEditorState();
}

class _MessageEditorState extends State<MessageEditor> {
  late TextEditingController controller;
  @override
  void initState() {
    super.initState();
    controller = TextEditingController();

    controller.addListener(() {
      var plainText = controller.text;
      widget.onChange(plainText);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 16.0),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
            decoration: InputDecoration(
                label: const Text("Indhold"),
                border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8.0))),
            controller: controller,
          ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }
}
