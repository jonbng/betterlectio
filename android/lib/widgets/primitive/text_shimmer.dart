import 'package:flutter/material.dart';
import 'package:betterlectio/widgets/primitive/bl_shimmer.dart';

class TextShimmer extends StatelessWidget {
  const TextShimmer(this.content,
      {super.key, this.width = 80.0, this.height = 25.0, this.style});
  final String content;
  final double width;
  final double height;
  final TextStyle? style;
  @override
  Widget build(BuildContext context) {
    return BlShimmer(
      enabled: content.isEmpty,
      child: content.isEmpty
          ? Container(
              decoration: BoxDecoration(
                  color: Colors.black, borderRadius: BorderRadius.circular(5)),
              width: width,
              height: height,
            )
          : Text(
              content,
              style: style,
            ),
    );
  }
}
