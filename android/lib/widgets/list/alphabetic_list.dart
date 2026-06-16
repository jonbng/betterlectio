import 'package:flutter/material.dart';
import 'package:betterlectio/topics/state/empty.dart';

class AssociatedObject<T> {
  String key;
  T object;
  AssociatedObject(this.key, this.object);
}

class AlphabeticList<T> extends StatefulWidget {
  const AlphabeticList({
    super.key,
    required this.list,
    required this.itemBuilder,
  });
  final List<AssociatedObject<T>> list;
  final Widget Function(BuildContext context, T item) itemBuilder;
  @override
  State<AlphabeticList<T>> createState() => _AlphabeticListState<T>();
}

class _AlphabeticListState<T> extends State<AlphabeticList<T>> {
  Map<String, List<AssociatedObject<T>>> lettersAndObjs = {};

  void _buildAssociations() async {
    lettersAndObjs = {};
    for (var obj in widget.list) {
      String startCharacter = obj.key.characters.first.toLowerCase();
      if (lettersAndObjs.containsKey(startCharacter)) {
        lettersAndObjs[startCharacter] =
            lettersAndObjs[startCharacter]!.toList()..add(obj);
      } else {
        lettersAndObjs.putIfAbsent(startCharacter, () => [obj]);
      }
    }
  }

  @override
  void initState() {
    super.initState();
    _buildAssociations();
  }

  @override
  void didUpdateWidget(covariant AlphabeticList<T> oldWidget) {
    super.didUpdateWidget(oldWidget);
    _buildAssociations();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
        body: widget.list.isEmpty
            ? const EmptyScreen()
            : ListView(
                children: lettersAndObjs.entries.map((letterAndObj) {
                return ListView.builder(
                  primary: false,
                  shrinkWrap: true,
                  itemCount: letterAndObj.value.length,
                  itemBuilder: (context, index) {
                    return widget.itemBuilder(
                        context, letterAndObj.value[index].object);
                  },
                );
              }).toList()));
  }
}
