import 'package:flutter/widgets.dart';

class PaddedColumn extends StatefulWidget {
  const PaddedColumn(
      {super.key,
      required this.padding,
      required this.children,
      this.crossAxisAlignment});
  final double padding;
  final CrossAxisAlignment? crossAxisAlignment;
  final List<Widget> children;

  @override
  State<PaddedColumn> createState() => _PaddedColumnState();
}

class _PaddedColumnState extends State<PaddedColumn> {
  late List<Widget> renderChildren;

  @override
  void initState() {
    super.initState();
    updateRenderChildren();
  }

  @override
  void didUpdateWidget(covariant PaddedColumn oldWidget) {
    updateRenderChildren();
    super.didUpdateWidget(oldWidget);
  }

  void updateRenderChildren() {
    renderChildren = widget.children.indexed.map((content) {
      var index = content.$1;
      var child = content.$2;
      if (index < widget.children.length - 1) {
        return [
          child,
          SizedBox(
            height: widget.padding,
          )
        ];
      }
      return [child];
    }).expand((elements) {
      return elements;
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment:
          widget.crossAxisAlignment ?? CrossAxisAlignment.center,
      mainAxisSize: MainAxisSize.min,
      children: renderChildren,
    );
  }
}
